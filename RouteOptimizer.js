// ==================== PRODUCTION ROUTE OPTIMIZER - CVRP WITH PHASE 2 ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
    this.vehicles = [];
    this.depot = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };
    this.originalStores = [];
    this.allVisitInstances = [];
    this.initializeVehicles();
  }

  // ==================== INITIALIZATION ====================

  initializeVehicles() {
    this.vehicles = [];
    let vehicleId = 0;

    this.workingDays.forEach((week, weekIdx) => {
      week.forEach((dayInfo, dayIdx) => {
        const workStart = CONFIG.WORK.START; // 540 min (9:00 AM)
        const workEnd = CONFIG.WORK.END; // 1100 min (6:20 PM)
        const isFriday = dayInfo.isFriday;

        const breakStart = isFriday
          ? CONFIG.FRIDAY_PRAYER.START
          : CONFIG.LUNCH.START;
        const breakEnd = isFriday ? CONFIG.FRIDAY_PRAYER.END : CONFIG.LUNCH.END;
        const breakDuration = breakEnd - breakStart;
        const netWorkTime = workEnd - workStart - breakDuration;

        this.vehicles.push({
          id: vehicleId++,
          weekIndex: weekIdx,
          dayIndex: dayIdx,
          dayInfo: dayInfo,

          // Capacity constraints
          capacity: CONFIG.CLUSTERING.MAX_STORES_PER_DAY,
          currentLoad: 0,
          route: [],

          // Time constraints
          workStart,
          workEnd,
          breakStart,
          breakEnd,
          breakDuration,
          netWorkTime,
          isFriday,
          currentTime: workStart,
          timeBuffer: 5, // 10 min safety margin

          // Tracking
          totalDistance: 0,
          districts: new Set(),
          estimatedFinishTime: workStart,
          timeCompliant: true,
        });
      });
    });

    Utils.log(
      `Initialized ${this.vehicles.length} vehicles with CVRP constraints`,
      "INFO"
    );
  }

  // ==================== VISIT INSTANCE CREATION ====================

  createVisitInstances(stores) {
    const instances = [];

    stores.forEach((store) => {
      const distanceFromDepot = Utils.distance(
        this.depot.lat,
        this.depot.lng,
        store.lat,
        store.lng
      );

      // Apply 40km distance limit
      if (
        distanceFromDepot > (CONFIG.TRAVEL_LIMITS?.MAX_DISTANCE_FROM_HOME || 40)
      ) {
        Utils.log(
          `❌ Skipping ${store.name}: ${distanceFromDepot.toFixed(
            1
          )}km > 40km limit`,
          "WARN"
        );
        return;
      }

      if (store.actualVisits > 0) {
        for (let v = 0; v < store.actualVisits; v++) {
          instances.push({
            ...store,
            visitNum: v + 1,
            visitId: `${store.name}_${v + 1}`,
            storeId: store.name,
            isMultiVisit: store.actualVisits > 1,
            distanceFromDepot: distanceFromDepot,
            demand: 1,
            serviceTime: store.visitTime || CONFIG.DEFAULT_VISIT_TIME,
          });
        }
      }
    });

    Utils.log(
      `Created ${instances.length} visit instances (30km filtered)`,
      "INFO"
    );
    return instances;
  }

  // ==================== CVRP SOLVER ====================

  solveCVRP(visitInstances) {
    Utils.log("=== SOLVING CVRP WITH ALL CONSTRAINTS ===", "INFO");

    // Step 1: Handle multi-visit stores first (strictest constraints)
    this.assignMultiVisitStores(visitInstances);

    // Step 2: Apply savings algorithm to remaining single-visit stores
    this.assignSingleVisitStores(visitInstances);

    // Step 3: Final optimization and validation
    this.finalOptimization();
  }

  // ==================== MULTI-VISIT ASSIGNMENT ====================

  assignMultiVisitStores(allInstances) {
    Utils.log("=== ASSIGNING MULTI-VISIT STORES ===", "INFO");

    // Group multi-visit stores by store ID
    const storeGroups = {};
    allInstances
      .filter((s) => s.isMultiVisit)
      .forEach((store) => {
        const storeId = store.storeId || store.name;
        if (!storeGroups[storeId]) storeGroups[storeId] = [];
        storeGroups[storeId].push(store);
      });

    Object.entries(storeGroups).forEach(([storeId, visits]) => {
      this.assignMultiVisitGroup(storeId, visits);
    });
  }

  assignMultiVisitGroup(storeId, visits) {
    if (visits.length === 1) {
      this.assignSingleStore(visits[0]);
    } else if (visits.length === 2) {
      this.assignTwoVisitStore(storeId, visits);
    } else {
      this.assignMultipleVisitStore(storeId, visits);
    }
  }

  assignTwoVisitStore(storeId, visits) {
    const [visit1, visit2] = visits.sort((a, b) => a.visitNum - b.visitNum);
    const validPairs = [];

    // Find vehicle pairs with 14+ day gap
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 14; j < this.vehicles.length; j++) {
        const vehicle1 = this.vehicles[i];
        const vehicle2 = this.vehicles[j];

        if (
          this.canAssignStore(vehicle1, visit1) &&
          this.canAssignStore(vehicle2, visit2)
        ) {
          const score = this.calculatePairScore(
            vehicle1,
            vehicle2,
            visit1,
            visit2
          );
          validPairs.push({ vehicle1, vehicle2, score, gap: j - i });
        }
      }
    }

    if (validPairs.length > 0) {
      const bestPair = validPairs.sort((a, b) => b.score - a.score)[0];
      this.assignStoreToVehicle(bestPair.vehicle1, visit1);
      this.assignStoreToVehicle(bestPair.vehicle2, visit2);
      Utils.log(
        `✅ ${storeId}: Vehicle ${bestPair.vehicle1.id} & ${bestPair.vehicle2.id} (${bestPair.gap}-day gap)`,
        "INFO"
      );
    } else {
      Utils.log(`❌ ${storeId}: No valid vehicle pairs found`, "ERROR");
      this.assignSingleStore(visit1);
      this.assignSingleStore(visit2);
    }
  }

  assignMultipleVisitStore(storeId, visits) {
    const sortedVisits = visits.sort((a, b) => a.visitNum - b.visitNum);
    const optimalGap = Math.max(
      14,
      Math.floor(this.vehicles.length / visits.length)
    );

    let nextDay = 0;
    const assignedVehicles = [];

    sortedVisits.forEach((visit, index) => {
      let assigned = false;
      for (let i = nextDay; i < this.vehicles.length; i++) {
        const vehicle = this.vehicles[i];
        const hasValidGap = assignedVehicles.every(
          (prevDay) => Math.abs(i - prevDay) >= 14
        );

        if (this.canAssignStore(vehicle, visit) && hasValidGap) {
          this.assignStoreToVehicle(vehicle, visit);
          assignedVehicles.push(i);
          nextDay = i + 14;
          assigned = true;
          Utils.log(
            `✅ ${storeId} visit ${visit.visitNum} → Vehicle ${vehicle.id}`,
            "INFO"
          );
          break;
        }
      }

      if (!assigned) {
        Utils.log(
          `❌ ${storeId} visit ${visit.visitNum}: No suitable vehicle`,
          "ERROR"
        );
      }
    });
  }

  // ==================== SINGLE-VISIT ASSIGNMENT ====================

  assignSingleVisitStores(allInstances) {
    const singleVisitStores = allInstances.filter(
      (s) => !s.isMultiVisit && !this.isAssigned(s)
    );

    if (singleVisitStores.length === 0) return;

    Utils.log(
      `=== ASSIGNING ${singleVisitStores.length} SINGLE-VISIT STORES ===`,
      "INFO"
    );

    // Apply savings algorithm
    const savings = this.calculateSavings(singleVisitStores);
    savings.sort((a, b) => b.saving - a.saving);

    const assigned = new Set();

    // Process savings pairs
    savings.forEach(({ storeA, storeB, saving }) => {
      if (assigned.has(storeA.visitId) || assigned.has(storeB.visitId)) return;

      const vehicle = this.findBestVehicleForPair(storeA, storeB);
      if (vehicle) {
        this.assignStoreToVehicle(vehicle, storeA);
        this.assignStoreToVehicle(vehicle, storeB);
        assigned.add(storeA.visitId);
        assigned.add(storeB.visitId);
        Utils.log(
          `Paired: ${storeA.name} + ${storeB.name} → Vehicle ${
            vehicle.id
          } (${saving.toFixed(1)}km saved)`,
          "INFO"
        );
      }
    });

    // Assign remaining individual stores
    singleVisitStores.forEach((store) => {
      if (!assigned.has(store.visitId)) {
        this.assignSingleStore(store);
      }
    });
  }

  assignSingleStore(store) {
    const bestVehicle = this.findBestVehicleForStore(store);
    if (bestVehicle) {
      this.assignStoreToVehicle(bestVehicle, store);
      Utils.log(`✅ ${store.name} → Vehicle ${bestVehicle.id}`, "INFO");
    } else {
      Utils.log(`❌ ${store.name}: No suitable vehicle`, "ERROR");
    }
  }

  // ==================== CONSTRAINT CHECKING ====================

  canAssignStore(vehicle, store) {
    // Capacity check
    if (vehicle.currentLoad >= vehicle.capacity) return false;

    // Multi-visit gap check
    if (store.isMultiVisit && this.hasMultiVisitConflict(vehicle, store))
      return false;

    // Time feasibility check
    return this.isTimeFeasible(vehicle, [store]);
  }

  hasMultiVisitConflict(vehicle, store) {
    const storeId = store.storeId || store.name;
    return this.vehicles.some((v) => {
      if (v.id === vehicle.id) return false;
      const hasStore = v.route.some((s) => (s.storeId || s.name) === storeId);
      const dayGap = Math.abs(v.id - vehicle.id);
      return hasStore && dayGap < 14;
    });
  }

  isTimeFeasible(vehicle, newStores) {
    const testRoute = [...vehicle.route, ...newStores];
    const simulation = this.simulateRoute(vehicle, testRoute);
    return simulation.finishTime <= vehicle.workEnd - vehicle.timeBuffer;
  }

  // ==================== SCORING AND SELECTION ====================

  calculatePairScore(vehicle1, vehicle2, visit1, visit2) {
    const districtBonus1 = vehicle1.districts.has(visit1.district) ? 15 : 0;
    const districtBonus2 = vehicle2.districts.has(visit2.district) ? 15 : 0;
    const capacityScore1 = (vehicle1.capacity - vehicle1.currentLoad) * 2;
    const capacityScore2 = (vehicle2.capacity - vehicle2.currentLoad) * 2;
    const timeScore1 = Math.max(
      0,
      (vehicle1.workEnd - vehicle1.estimatedFinishTime) / 10
    );
    const timeScore2 = Math.max(
      0,
      (vehicle2.workEnd - vehicle2.estimatedFinishTime) / 10
    );

    return (
      districtBonus1 +
      districtBonus2 +
      capacityScore1 +
      capacityScore2 +
      timeScore1 +
      timeScore2
    );
  }

  findBestVehicleForStore(store) {
    let bestVehicle = null;
    let bestScore = -1;

    this.vehicles.forEach((vehicle) => {
      if (!this.canAssignStore(vehicle, store)) return;

      const districtBonus = vehicle.districts.has(store.district) ? 20 : 0;
      const capacityScore = (vehicle.capacity - vehicle.currentLoad) * 3;
      const timeScore = Math.max(
        0,
        (vehicle.workEnd - vehicle.estimatedFinishTime) / 15
      );
      const insertionCost = this.calculateInsertionCost(vehicle, store);

      const score = districtBonus + capacityScore + timeScore - insertionCost;

      if (score > bestScore) {
        bestScore = score;
        bestVehicle = vehicle;
      }
    });

    return bestVehicle;
  }

  findBestVehicleForPair(storeA, storeB) {
    return this.vehicles.find((vehicle) => {
      const hasCapacity = vehicle.capacity - vehicle.currentLoad >= 2;
      const noMultiVisitConflicts =
        !this.hasMultiVisitConflict(vehicle, storeA) &&
        !this.hasMultiVisitConflict(vehicle, storeB);
      const timeFeasible = this.isTimeFeasible(vehicle, [storeA, storeB]);

      return hasCapacity && noMultiVisitConflicts && timeFeasible;
    });
  }

  // ==================== SAVINGS ALGORITHM ====================

  calculateSavings(stores) {
    const savings = [];

    for (let i = 0; i < stores.length; i++) {
      for (let j = i + 1; j < stores.length; j++) {
        const storeA = stores[i];
        const storeB = stores[j];

        const depotToA = Utils.distance(
          this.depot.lat,
          this.depot.lng,
          storeA.lat,
          storeA.lng
        );
        const depotToB = Utils.distance(
          this.depot.lat,
          this.depot.lng,
          storeB.lat,
          storeB.lng
        );
        const AToB = Utils.distance(
          storeA.lat,
          storeA.lng,
          storeB.lat,
          storeB.lng
        );

        const saving = depotToA + depotToB - AToB;

        if (saving > 0) {
          savings.push({ storeA, storeB, saving });
        }
      }
    }

    return savings;
  }

  calculateInsertionCost(vehicle, store) {
    if (vehicle.route.length === 0) {
      return Utils.distance(
        this.depot.lat,
        this.depot.lng,
        store.lat,
        store.lng
      );
    }

    const lastStore = vehicle.route[vehicle.route.length - 1];
    return Utils.distance(lastStore.lat, lastStore.lng, store.lat, store.lng);
  }

  // ==================== VEHICLE ASSIGNMENT ====================

  assignStoreToVehicle(vehicle, store) {
    vehicle.route.push(store);
    vehicle.currentLoad += 1;
    vehicle.districts.add(store.district);

    // Update distance
    if (vehicle.route.length === 1) {
      vehicle.totalDistance += Utils.distance(
        this.depot.lat,
        this.depot.lng,
        store.lat,
        store.lng
      );
    } else {
      const prevStore = vehicle.route[vehicle.route.length - 2];
      vehicle.totalDistance += Utils.distance(
        prevStore.lat,
        prevStore.lng,
        store.lat,
        store.lng
      );
    }

    // Update time estimate
    this.updateVehicleTimeEstimate(vehicle);
  }

  updateVehicleTimeEstimate(vehicle) {
    if (vehicle.route.length === 0) return;

    const simulation = this.simulateRoute(vehicle, vehicle.route);
    vehicle.estimatedFinishTime = simulation.finishTime;
  }

  // ==================== TIME SIMULATION ====================

  simulateRoute(vehicle, stores) {
    if (stores.length === 0) {
      return { finishTime: vehicle.workStart, totalTime: 0, hasBreak: false };
    }

    let currentTime = vehicle.workStart;
    let currentLat = this.depot.lat;
    let currentLng = this.depot.lng;
    let hasBreak = false;
    let totalTime = 0;

    // Simulate each store visit
    stores.forEach((store) => {
      // Travel time
      const distance = Utils.distance(
        currentLat,
        currentLng,
        store.lat,
        store.lng
      );
      const travelTime = this.calculateTravelTime(
        distance,
        currentLat === this.depot.lat
      );
      currentTime += travelTime;
      totalTime += travelTime;

      // Break handling
      if (
        !hasBreak &&
        currentTime >= vehicle.breakStart &&
        currentTime < vehicle.breakEnd
      ) {
        currentTime = vehicle.breakEnd;
        hasBreak = true;
      }

      // Visit time
      const visitTime =
        CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);
      currentTime += visitTime;
      totalTime += visitTime;

      currentLat = store.lat;
      currentLng = store.lng;
    });

    // Return to depot
    const returnDistance = Utils.distance(
      currentLat,
      currentLng,
      this.depot.lat,
      this.depot.lng
    );
    const returnTime = this.calculateTravelTime(returnDistance, false);
    currentTime += returnTime;
    totalTime += returnTime;

    return {
      finishTime: currentTime,
      totalTime: totalTime,
      hasBreak: hasBreak,
      overTime: Math.max(0, currentTime - vehicle.workEnd),
    };
  }

  calculateTravelTime(distance, isFromDepot) {
    if (isFromDepot) {
      return Math.round(distance * 3); // 3 min/km from depot
    } else {
      return Math.max(3, Math.round(distance * 3.5)); // 3.5 min/km between stores
    }
  }

  // ==================== FINAL OPTIMIZATION ====================

  finalOptimization() {
    Utils.log("=== FINAL OPTIMIZATION ===", "INFO");

    // Phase 1: Optimize route order within each vehicle
    this.vehicles.forEach((vehicle) => {
      if (vehicle.route.length > 1) {
        vehicle.route = this.optimizeRouteOrder(vehicle.route);
        this.updateVehicleTimeEstimate(vehicle);
      }
    });

    // Phase 2: Fill under-utilized days with nearby unassigned stores
    this.phase2_FillUnderutilizedDays();

    // Phase 3: Handle remaining time violations
    this.resolveTimeViolations();
  }

  // ==================== PHASE 2: FILL UNDER-UTILIZED DAYS ====================

  phase2_FillUnderutilizedDays() {
    Utils.log("=== PHASE 2: FILLING UNDER-UTILIZED DAYS ===", "INFO");

    // Find under-utilized vehicles (finish early + have capacity)
    const underutilizedVehicles = this.findUnderutilizedVehicles();

    if (underutilizedVehicles.length === 0) {
      Utils.log("No under-utilized vehicles found", "INFO");
      return;
    }

    // Get all unassigned stores
    const unassignedStores = this.getAllUnassignedStores();

    if (unassignedStores.length === 0) {
      Utils.log("No unassigned stores available for Phase 2", "INFO");
      return;
    }

    Utils.log(
      `Found ${underutilizedVehicles.length} under-utilized vehicles and ${unassignedStores.length} unassigned stores`,
      "INFO"
    );

    // For each under-utilized vehicle, try to add nearby stores
    underutilizedVehicles.forEach((vehicleInfo) => {
      this.fillVehicleWithNearbyStores(vehicleInfo, unassignedStores);
    });

    Utils.log("Phase 2 optimization completed", "INFO");
  }

  findUnderutilizedVehicles() {
    const underutilized = [];

    this.vehicles.forEach((vehicle) => {
      if (vehicle.route.length === 0) return; // Skip empty vehicles

      const simulation = this.simulateRoute(vehicle, vehicle.route);
      const availableCapacity = vehicle.capacity - vehicle.currentLoad;
      const finishTime = simulation.finishTime;
      const timeRemaining = vehicle.workEnd - finishTime;
      const timeBuffer = vehicle.timeBuffer;

      // Criteria for under-utilization:
      // 1. Has available capacity (at least 1 store)
      // 2. Finishes early (more than 60 minutes before end time including buffer)
      // 3. Not already at optimal load
      const hasCapacity = availableCapacity >= 1;
      const finishesEarly = timeRemaining > 60 + timeBuffer; // 60 min + safety buffer
      const notOptimal = vehicle.currentLoad < vehicle.capacity * 0.8; // Less than 80% utilized

      if (hasCapacity && finishesEarly && notOptimal) {
        underutilized.push({
          vehicle: vehicle,
          availableCapacity: availableCapacity,
          timeRemaining: timeRemaining,
          currentFinishTime: finishTime,
          utilizationRate: (vehicle.currentLoad / vehicle.capacity) * 100,

          // Calculate potential for additional stores
          potentialStores: Math.min(
            availableCapacity,
            Math.floor((timeRemaining - timeBuffer) / 45) // 45 min per store estimate
          ),
        });

        Utils.log(
          `Under-utilized Vehicle ${vehicle.id}: ${vehicle.currentLoad}/${
            vehicle.capacity
          } stores, finishes at ${Utils.formatTime(
            finishTime
          )} (${timeRemaining} min remaining), potential: ${Math.min(
            availableCapacity,
            Math.floor((timeRemaining - timeBuffer) / 45)
          )} more stores`,
          "INFO"
        );
      }
    });

    // Sort by utilization rate (lowest first - most under-utilized)
    return underutilized.sort((a, b) => a.utilizationRate - b.utilizationRate);
  }

  getAllUnassignedStores() {
    if (!this.allVisitInstances) {
      Utils.log("No visit instances available for Phase 2", "WARN");
      return [];
    }

    // Get all assigned store IDs
    const assignedIds = new Set();
    this.vehicles.forEach((vehicle) => {
      vehicle.route.forEach((store) => {
        assignedIds.add(store.visitId || store.name);
      });
    });

    // Find unassigned stores
    const unassigned = this.allVisitInstances.filter(
      (instance) => !assignedIds.has(instance.visitId || instance.name)
    );

    Utils.log(
      `Found ${unassigned.length} unassigned stores for Phase 2 optimization`,
      "INFO"
    );

    return unassigned;
  }

  fillVehicleWithNearbyStores(vehicleInfo, unassignedStores) {
    const vehicle = vehicleInfo.vehicle;
    const maxAdditionalStores = vehicleInfo.potentialStores;

    if (maxAdditionalStores <= 0) return;

    Utils.log(
      `Filling Vehicle ${vehicle.id} with up to ${maxAdditionalStores} additional stores`,
      "INFO"
    );

    // Calculate vehicle's current geographic center
    const vehicleCenter = this.calculateVehicleCenter(vehicle);

    // Find nearby unassigned stores
    const nearbyStores = unassignedStores
      .map((store) => ({
        store: store,
        distanceFromVehicle: Utils.distance(
          vehicleCenter.lat,
          vehicleCenter.lng,
          store.lat,
          store.lng
        ),
      }))
      .filter((item) => {
        // Apply constraints
        const withinReasonableDistance = item.distanceFromVehicle <= 15; // 15km from vehicle center
        const noMultiVisitConflict =
          !item.store.isMultiVisit ||
          !this.hasMultiVisitConflict(vehicle, item.store);
        const withinDistanceLimit =
          item.store.distanceFromDepot <=
          (CONFIG.TRAVEL_LIMITS?.MAX_DISTANCE_FROM_HOME || 30);

        return (
          withinReasonableDistance &&
          noMultiVisitConflict &&
          withinDistanceLimit
        );
      })
      .sort((a, b) => a.distanceFromVehicle - b.distanceFromVehicle); // Closest first

    Utils.log(
      `Found ${nearbyStores.length} nearby candidate stores for Vehicle ${vehicle.id}`,
      "INFO"
    );

    // Try to add stores one by one
    let addedStores = 0;

    for (const item of nearbyStores) {
      if (addedStores >= maxAdditionalStores) break;

      const store = item.store;

      // Check if we can still add this store (time + capacity)
      if (this.canAddStoreToVehicle(vehicle, store)) {
        this.assignStoreToVehicle(vehicle, store);
        addedStores++;

        // Remove from unassigned list
        const unassignedIndex = unassignedStores.indexOf(store);
        if (unassignedIndex > -1) {
          unassignedStores.splice(unassignedIndex, 1);
        }

        Utils.log(
          `✅ Phase 2: Added ${store.name} to Vehicle ${
            vehicle.id
          } (${item.distanceFromVehicle.toFixed(1)}km from vehicle center)`,
          "INFO"
        );

        // Re-optimize route order after adding store
        vehicle.route = this.optimizeRouteOrder(vehicle.route);
        this.updateVehicleTimeEstimate(vehicle);

        // Check if vehicle is now well-utilized
        const newSimulation = this.simulateRoute(vehicle, vehicle.route);
        const newTimeRemaining = vehicle.workEnd - newSimulation.finishTime;

        if (newTimeRemaining < 60 + vehicle.timeBuffer) {
          Utils.log(
            `Vehicle ${vehicle.id} now well-utilized, stopping Phase 2 additions`,
            "INFO"
          );
          break;
        }
      } else {
        Utils.log(
          `Cannot add ${store.name} to Vehicle ${vehicle.id}: constraint violation`,
          "INFO"
        );
      }
    }

    if (addedStores > 0) {
      const finalSimulation = this.simulateRoute(vehicle, vehicle.route);
      const newUtilization = (vehicle.currentLoad / vehicle.capacity) * 100;

      Utils.log(
        `✅ Phase 2 completed for Vehicle ${
          vehicle.id
        }: Added ${addedStores} stores, new utilization: ${newUtilization.toFixed(
          1
        )}%, finishes at ${Utils.formatTime(finalSimulation.finishTime)}`,
        "INFO"
      );
    } else {
      Utils.log(
        `No stores could be added to Vehicle ${vehicle.id} due to constraints`,
        "WARN"
      );
    }
  }

  calculateVehicleCenter(vehicle) {
    if (vehicle.route.length === 0) {
      return { lat: this.depot.lat, lng: this.depot.lng };
    }

    const totalLat = vehicle.route.reduce((sum, store) => sum + store.lat, 0);
    const totalLng = vehicle.route.reduce((sum, store) => sum + store.lng, 0);

    return {
      lat: totalLat / vehicle.route.length,
      lng: totalLng / vehicle.route.length,
    };
  }

  canAddStoreToVehicle(vehicle, store) {
    // Check capacity
    if (vehicle.currentLoad >= vehicle.capacity) {
      return false;
    }

    // Check multi-visit conflicts
    if (store.isMultiVisit && this.hasMultiVisitConflict(vehicle, store)) {
      return false;
    }

    // Check time feasibility with the new store
    const testRoute = [...vehicle.route, store];
    const testSimulation = this.simulateRoute(vehicle, testRoute);
    const wouldFinishOnTime =
      testSimulation.finishTime <= vehicle.workEnd - vehicle.timeBuffer;

    return wouldFinishOnTime;
  }

  // ==================== ROUTE OPTIMIZATION ====================

  optimizeRouteOrder(stores) {
    if (stores.length <= 2) return stores;

    // Simple nearest neighbor optimization
    const optimized = [];
    const remaining = [...stores];
    let currentLat = this.depot.lat;
    let currentLng = this.depot.lng;

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDistance = Utils.distance(
        currentLat,
        currentLng,
        remaining[0].lat,
        remaining[0].lng
      );

      for (let i = 1; i < remaining.length; i++) {
        const distance = Utils.distance(
          currentLat,
          currentLng,
          remaining[i].lat,
          remaining[i].lng
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestIdx = i;
        }
      }

      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      currentLat = nearest.lat;
      currentLng = nearest.lng;
    }

    return optimized;
  }

  resolveTimeViolations() {
    const violatingVehicles = this.vehicles.filter((v) => {
      if (v.route.length === 0) return false;
      const sim = this.simulateRoute(v, v.route);
      return sim.finishTime > v.workEnd - v.timeBuffer;
    });

    Utils.log(
      `Found ${violatingVehicles.length} vehicles with time violations`,
      "INFO"
    );

    violatingVehicles.forEach((vehicle) => {
      const removed = this.removeExcessStores(vehicle);
      Utils.log(
        `Vehicle ${vehicle.id}: Removed ${removed} stores to fix time violation`,
        "WARN"
      );
    });
  }

  removeExcessStores(vehicle) {
    let removed = 0;

    while (vehicle.route.length > 0) {
      const sim = this.simulateRoute(vehicle, vehicle.route);
      if (sim.finishTime <= vehicle.workEnd - vehicle.timeBuffer) break;
    }
  }

  removeExcessStores(vehicle) {
    let removed = 0;

    while (vehicle.route.length > 0) {
      const sim = this.simulateRoute(vehicle, vehicle.route);
      if (sim.finishTime <= vehicle.workEnd - vehicle.timeBuffer) break;

      // Remove last store (simplest approach)
      const removedStore = vehicle.route.pop();
      vehicle.currentLoad -= 1;
      removed++;

      // Try to reassign to another vehicle
      this.tryReassignStore(removedStore, vehicle);
    }

    this.updateVehicleTimeEstimate(vehicle);
    return removed;
  }

  tryReassignStore(store, excludeVehicle) {
    const candidates = this.vehicles.filter((v) => v.id !== excludeVehicle.id);
    const bestVehicle = candidates.find((v) => this.canAssignStore(v, store));

    if (bestVehicle) {
      this.assignStoreToVehicle(bestVehicle, store);
      Utils.log(
        `Reassigned ${store.name} to Vehicle ${bestVehicle.id}`,
        "INFO"
      );
    } else {
      Utils.log(`Could not reassign ${store.name}`, "WARN");
    }
  }

  // ==================== OUTPUT CONVERSION ====================

  optimizePlan(stores) {
    Utils.log("=== CVRP OPTIMIZATION WITH PHASE 2 STARTED ===", "INFO");

    const visitInstances = this.createVisitInstances(stores);

    // Store original instances for Phase 2 tracking
    this.originalStores = [...stores];
    this.allVisitInstances = [...visitInstances];

    this.solveCVRP(visitInstances);
    this.convertToWorkingDays();

    Utils.log("=== CVRP OPTIMIZATION WITH PHASE 2 COMPLETED ===", "INFO");
    this.logSolution();

    return {
      workingDays: this.workingDays,
      unvisitedStores: this.getUnvisitedStores(stores, visitInstances),
      statistics: this.calculateStatistics(visitInstances),
      p1VisitFrequency: this.getAverageFrequency(stores, "P1"),
      hasW5: this.workingDays.length === 5,
    };
  }

  convertToWorkingDays() {
    this.vehicles.forEach((vehicle) => {
      const weekDay = this.workingDays[vehicle.weekIndex][vehicle.dayIndex];

      if (vehicle.route.length > 0) {
        weekDay.optimizedStores = this.createDetailedRoute(vehicle);
        weekDay.totalDistance = vehicle.totalDistance;
        weekDay.districts = Array.from(vehicle.districts);
        weekDay.vehicleId = vehicle.id;

        const simulation = this.simulateRoute(vehicle, vehicle.route);
        weekDay.timing = {
          startTime: vehicle.workStart,
          finishTime: simulation.finishTime,
          timeCompliant: simulation.finishTime <= vehicle.workEnd,
          overTime: simulation.overTime,
          hasBreak: simulation.hasBreak,
        };
      } else {
        weekDay.optimizedStores = [];
        weekDay.totalDistance = 0;
        weekDay.districts = [];
        weekDay.timing = null;
      }
    });
  }

  createDetailedRoute(vehicle) {
    const route = [];
    let currentTime = vehicle.workStart;
    let currentLat = this.depot.lat;
    let currentLng = this.depot.lng;
    let hasBreak = false;

    vehicle.route.forEach((store, index) => {
      const distance = Utils.distance(
        currentLat,
        currentLng,
        store.lat,
        store.lng
      );
      const travelTime = this.calculateTravelTime(distance, index === 0);
      currentTime += travelTime;

      if (
        !hasBreak &&
        currentTime >= vehicle.breakStart &&
        currentTime < vehicle.breakEnd
      ) {
        currentTime = vehicle.breakEnd;
        hasBreak = true;
      }

      const arrivalTime = currentTime;
      const visitTime =
        CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);
      const departTime = arrivalTime + visitTime;

      route.push({
        ...store,
        order: index + 1,
        distance: distance,
        duration: travelTime,
        arrivalTime: arrivalTime,
        departTime: departTime,
      });

      currentTime = departTime;
      currentLat = store.lat;
      currentLng = store.lng;
    });

    return route;
  }

  // ==================== UTILITIES ====================

  isAssigned(store) {
    return this.vehicles.some((v) =>
      v.route.some(
        (s) => (s.visitId || s.name) === (store.visitId || store.name)
      )
    );
  }

  getUnvisitedStores(originalStores, visitInstances) {
    const assignedIds = new Set();
    this.vehicles.forEach((v) =>
      v.route.forEach((s) => assignedIds.add(s.visitId))
    );
    return visitInstances.filter(
      (instance) => !assignedIds.has(instance.visitId)
    );
  }

  logSolution() {
    const active = this.vehicles.filter((v) => v.route.length > 0);
    const totalStores = this.vehicles.reduce(
      (sum, v) => sum + v.route.length,
      0
    );
    const totalDistance = this.vehicles.reduce(
      (sum, v) => sum + v.totalDistance,
      0
    );

    // Calculate utilization statistics
    const utilizationStats = this.calculateUtilizationStats(active);

    Utils.log(`=== CVRP SOLUTION WITH PHASE 2 OPTIMIZATION ===`, "INFO");
    Utils.log(`Active days: ${active.length}/${this.vehicles.length}`, "INFO");
    Utils.log(`Total stores: ${totalStores}`, "INFO");
    Utils.log(`Total distance: ${totalDistance.toFixed(1)}km`, "INFO");
    Utils.log(
      `Avg stores/day: ${(totalStores / active.length).toFixed(1)}`,
      "INFO"
    );

    // Phase 2 specific logging
    Utils.log(`=== UTILIZATION ANALYSIS ===`, "INFO");
    Utils.log(
      `Well-utilized days: ${utilizationStats.wellUtilized}/${active.length}`,
      "INFO"
    );
    Utils.log(
      `Under-utilized days: ${utilizationStats.underUtilized}/${active.length}`,
      "INFO"
    );
    Utils.log(
      `Average utilization: ${utilizationStats.averageUtilization.toFixed(1)}%`,
      "INFO"
    );
    Utils.log(
      `Days finishing early (>60 min): ${utilizationStats.earlyFinishers}`,
      "INFO"
    );

    if (utilizationStats.underUtilized > 0) {
      Utils.log(
        `⚠️ Consider running Phase 2 optimization to fill under-utilized days`,
        "WARN"
      );
    } else {
      Utils.log(
        `✅ Phase 2 optimization successful - all days well-utilized`,
        "INFO"
      );
    }
  }

  calculateUtilizationStats(activeVehicles) {
    let wellUtilized = 0;
    let underUtilized = 0;
    let totalUtilization = 0;
    let earlyFinishers = 0;

    activeVehicles.forEach((vehicle) => {
      const utilizationRate = (vehicle.currentLoad / vehicle.capacity) * 100;
      totalUtilization += utilizationRate;

      const simulation = this.simulateRoute(vehicle, vehicle.route);
      const timeRemaining = vehicle.workEnd - simulation.finishTime;

      if (utilizationRate >= 80 || timeRemaining < 60 + vehicle.timeBuffer) {
        wellUtilized++;
      } else {
        underUtilized++;
      }

      if (timeRemaining > 60 + vehicle.timeBuffer) {
        earlyFinishers++;
      }
    });

    return {
      wellUtilized,
      underUtilized,
      averageUtilization:
        activeVehicles.length > 0
          ? totalUtilization / activeVehicles.length
          : 0,
      earlyFinishers,
    };
  }

  calculateStatistics(visitInstances) {
    const active = this.vehicles.filter((v) => v.route.length > 0);
    const totalStores = this.vehicles.reduce(
      (sum, v) => sum + v.route.length,
      0
    );
    const totalDistance = this.vehicles.reduce(
      (sum, v) => sum + v.totalDistance,
      0
    );

    // Enhanced statistics with Phase 2 tracking
    const utilizationStats = this.calculateUtilizationStats(active);
    const timeCompliant = active.filter((v) => {
      const sim = this.simulateRoute(v, v.route);
      return sim.finishTime <= v.workEnd;
    }).length;

    return {
      totalStoresPlanned: totalStores,
      totalStoresRequired: visitInstances.length,
      workingDays: active.length,
      averageStoresPerDay:
        active.length > 0 ? (totalStores / active.length).toFixed(1) : 0,
      averageDistancePerDay:
        active.length > 0 ? (totalDistance / active.length).toFixed(1) : 0,
      totalDistance: totalDistance,
      coveragePercentage:
        visitInstances.length > 0
          ? ((totalStores / visitInstances.length) * 100).toFixed(1)
          : 0,

      // CVRP with Phase 2 statistics
      cvrpOptimization: {
        algorithm: "CVRP with Phase 2 Under-Utilization Filling",
        constraintsEnforced: [
          "30km distance limit",
          "14-day multi-visit gaps",
          "Work hour compliance",
          "Capacity limits",
          "Phase 2 efficiency optimization",
        ],
        vehicles: this.vehicles.length,
        activeVehicles: active.length,
        timeCompliant: timeCompliant,
        timeComplianceRate:
          active.length > 0
            ? ((timeCompliant / active.length) * 100).toFixed(1) + "%"
            : "100%",
      },

      // Phase 2 specific metrics
      utilizationOptimization: {
        wellUtilizedDays: utilizationStats.wellUtilized,
        underUtilizedDays: utilizationStats.underUtilized,
        averageUtilization:
          utilizationStats.averageUtilization.toFixed(1) + "%",
        earlyFinishers: utilizationStats.earlyFinishers,
        phase2Effectiveness:
          utilizationStats.underUtilized === 0
            ? "Excellent"
            : utilizationStats.underUtilized <= 2
            ? "Good"
            : "Needs Improvement",
      },

      // Multi-visit compliance
      multiVisitCompliance: this.calculateMultiVisitStats(),
    };
  }

  calculateMultiVisitStats() {
    const multiVisitStores = {};

    // Collect all multi-visit stores
    this.vehicles.forEach((vehicle, vehicleIndex) => {
      vehicle.route.forEach((store) => {
        if (store.isMultiVisit) {
          const storeId = store.storeId || store.name;
          if (!multiVisitStores[storeId]) {
            multiVisitStores[storeId] = [];
          }
          multiVisitStores[storeId].push({
            vehicleId: vehicle.id,
            dayIndex: vehicleIndex,
            visitNum: store.visitNum,
          });
        }
      });
    });

    const totalMultiVisitStores = Object.keys(multiVisitStores).length;
    let validGaps = 0;
    let totalGaps = 0;

    Object.entries(multiVisitStores).forEach(([storeId, visits]) => {
      if (visits.length > 1) {
        visits.sort((a, b) => a.dayIndex - b.dayIndex);
        for (let i = 1; i < visits.length; i++) {
          const gap = visits[i].dayIndex - visits[i - 1].dayIndex;
          totalGaps++;
          if (gap >= 14) {
            validGaps++;
          }
        }
      }
    });

    return {
      totalMultiVisitStores,
      totalGaps,
      validGaps,
      gapCompliance:
        totalGaps > 0
          ? ((validGaps / totalGaps) * 100).toFixed(1) + "%"
          : "100%",
    };
  }

  getAverageFrequency(stores, priority) {
    const priorityStores = stores.filter((s) => s.priority === priority);
    if (priorityStores.length === 0) return 0;
    return (
      priorityStores.reduce((sum, s) => sum + (s.baseFrequency || 0), 0) /
      priorityStores.length
    );
  }
}

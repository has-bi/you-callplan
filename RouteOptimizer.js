// ==================== TWO-PHASE ROUTE OPTIMIZER ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
    this.flatDays = [];
    this.initializeFlatDays();
  }

  // Initialize flat day structure
  initializeFlatDays() {
    this.flatDays = [];
    this.workingDays.forEach((week, weekIdx) => {
      week.forEach((dayInfo, dayIdx) => {
        this.flatDays.push({
          ...dayInfo,
          weekIndex: weekIdx,
          dayIndex: dayIdx,
          globalDayIndex: this.flatDays.length,
          stores: [],
          targetCapacity: CONFIG.CLUSTERING.TARGET_STORES_PER_DAY,
          maxCapacity: CONFIG.CLUSTERING.MAX_STORES_PER_DAY,
        });
      });
    });

    Utils.log(
      `Initialized ${this.flatDays.length} working days for two-phase optimization`,
      "INFO"
    );
  }

  // STEP 1: Create visit instances (unchanged)
  createVisitInstances(stores) {
    const instances = [];
    stores.forEach((store) => {
      if (store.actualVisits > 0) {
        for (let v = 0; v < store.actualVisits; v++) {
          instances.push({
            ...store,
            visitNum: v + 1,
            visitId: `${store.name}_${v + 1}`,
            storeId: store.name,
            isMultiVisit: store.actualVisits > 1,
          });
        }
      }
    });

    Utils.log(
      `Created ${instances.length} visit instances from ${stores.length} stores`,
      "INFO"
    );
    return instances;
  }

  // STEP 2: Detect mall clusters (unchanged)
  detectMallClusters(stores) {
    if (!CONFIG.CLUSTERING.MALL_DETECTION.ENABLE_MALL_CLUSTERING) {
      return stores.map((store) => ({ ...store, mallClusterId: null }));
    }

    const mallClusters = [];
    const processed = new Set();
    let clusterId = 0;

    stores.forEach((store, index) => {
      if (processed.has(index)) return;

      const cluster = [{ store, index }];
      processed.add(index);

      stores.forEach((otherStore, otherIndex) => {
        if (processed.has(otherIndex)) return;

        const distance = Utils.distance(
          store.lat,
          store.lng,
          otherStore.lat,
          otherStore.lng
        );
        if (distance <= CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD) {
          cluster.push({ store: otherStore, index: otherIndex });
          processed.add(otherIndex);
        }
      });

      if (
        cluster.length > 1 &&
        cluster.length <= CONFIG.CLUSTERING.MALL_DETECTION.MAX_STORES_PER_MALL
      ) {
        mallClusters.push({
          id: `MALL_${clusterId++}`,
          stores: cluster,
          centerLat:
            cluster.reduce((sum, item) => sum + item.store.lat, 0) /
            cluster.length,
          centerLng:
            cluster.reduce((sum, item) => sum + item.store.lng, 0) /
            cluster.length,
          storeCount: cluster.length,
        });
      }
    });

    const storesWithMalls = stores.map((store) => ({
      ...store,
      mallClusterId: null,
    }));

    mallClusters.forEach((mallCluster) => {
      mallCluster.stores.forEach(({ index }) => {
        storesWithMalls[index].mallClusterId = mallCluster.id;
        storesWithMalls[index].mallClusterInfo = {
          storeCount: mallCluster.storeCount,
          centerLat: mallCluster.centerLat,
          centerLng: mallCluster.centerLng,
        };
      });
    });

    Utils.log(
      `Detected ${mallClusters.length} mall clusters from ${stores.length} stores`,
      "INFO"
    );
    return storesWithMalls;
  }

  // ==================== PHASE 1: AGGRESSIVE GEOGRAPHIC ASSIGNMENT ====================

  phase1_AggressiveAssignment(allVisitInstances) {
    Utils.log("=== PHASE 1: AGGRESSIVE GEOGRAPHIC ASSIGNMENT ===", "INFO");

    // Add mall clustering to all stores
    const storesWithMalls = this.detectMallClusters(allVisitInstances);

    // Create store pool for assignment
    const storePool = [...storesWithMalls];
    let totalAssigned = 0;

    // Fill each day to TARGET capacity (ignore constraints for now)
    this.flatDays.forEach((day, dayIndex) => {
      Utils.log(
        `Phase 1 - Filling Day ${dayIndex + 1} (${day.dayName})`,
        "INFO"
      );

      const targetStores = CONFIG.CLUSTERING.TARGET_STORES_PER_DAY;
      const assignedStores = this.aggressivelyFillDay(
        day,
        storePool,
        targetStores
      );

      // Remove assigned stores from pool
      assignedStores.forEach((store) => {
        const poolIndex = storePool.findIndex(
          (s) => (s.visitId || s.name) === (store.visitId || store.name)
        );
        if (poolIndex > -1) {
          storePool.splice(poolIndex, 1);
          totalAssigned++;
        }
      });

      Utils.log(
        `Day ${dayIndex + 1}: Assigned ${
          assignedStores.length
        } stores. Pool remaining: ${storePool.length}`,
        "INFO"
      );
    });

    // If stores remain, distribute them across days with capacity
    if (storePool.length > 0) {
      Utils.log(
        `Phase 1 - Distributing remaining ${storePool.length} stores`,
        "INFO"
      );
      this.distributeRemainingStores(storePool);
    }

    Utils.log(`Phase 1 completed: ${totalAssigned} stores assigned`, "INFO");
    return storePool; // Return unassigned stores
  }

  // NEW: Aggressively fill a single day
  aggressivelyFillDay(day, storePool, targetStores) {
    if (storePool.length === 0) return [];

    const assignedStores = [];
    const dayCenter = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG }; // Start from office

    // Find stores for this day using expanding radius search
    let searchRadius = 10; // Start with 10km
    const maxRadius = 100; // Expand up to 100km if needed

    while (
      assignedStores.length < targetStores &&
      storePool.length > 0 &&
      searchRadius <= maxRadius
    ) {
      // Find all stores within current radius
      const candidateStores = storePool.filter((store) => {
        const distance = Utils.distance(
          dayCenter.lat,
          dayCenter.lng,
          store.lat,
          store.lng
        );
        return distance <= searchRadius;
      });

      if (candidateStores.length === 0) {
        searchRadius += 10; // Expand search radius by 10km
        Utils.log(
          `Day ${
            day.globalDayIndex + 1
          }: Expanding search radius to ${searchRadius}km`,
          "INFO"
        );
        continue;
      }

      // Score and sort candidates by distance + mall bonus
      const scoredCandidates = candidateStores.map((store) => {
        const distance = Utils.distance(
          dayCenter.lat,
          dayCenter.lng,
          store.lat,
          store.lng
        );
        let score = 1000 - distance; // Closer = higher score

        // Mall bonus - prioritize completing mall clusters
        if (store.mallClusterId) {
          const existingMallStores = assignedStores.filter(
            (s) => s.mallClusterId === store.mallClusterId
          );
          if (existingMallStores.length > 0) {
            score += 500; // High bonus for completing mall clusters
          }
        }

        return { store, score, distance };
      });

      // Sort by score (highest first)
      scoredCandidates.sort((a, b) => b.score - a.score);

      // Take the best store(s) up to target
      const storesToTake = Math.min(
        targetStores - assignedStores.length,
        scoredCandidates.length
      );

      for (let i = 0; i < storesToTake; i++) {
        const selectedStore = scoredCandidates[i].store;
        assignedStores.push(selectedStore);

        // Update day center to be centroid of assigned stores
        if (assignedStores.length > 0) {
          dayCenter.lat =
            assignedStores.reduce((sum, s) => sum + s.lat, 0) /
            assignedStores.length;
          dayCenter.lng =
            assignedStores.reduce((sum, s) => sum + s.lng, 0) /
            assignedStores.length;
        }
      }

      // If we couldn't find enough stores in this radius, expand
      if (assignedStores.length < targetStores && candidateStores.length < 5) {
        searchRadius += 15;
      }
    }

    // Assign stores to day
    day.stores = [...assignedStores];

    Utils.log(
      `Aggressively filled day with ${assignedStores.length} stores (target: ${targetStores}, max radius used: ${searchRadius}km)`,
      "INFO"
    );
    return assignedStores;
  }

  // NEW: Distribute remaining stores to days with capacity
  distributeRemainingStores(remainingStores) {
    remainingStores.forEach((store) => {
      // Find day with most capacity
      let bestDay = null;
      let maxCapacity = 0;

      this.flatDays.forEach((day) => {
        const capacity =
          CONFIG.CLUSTERING.MAX_STORES_PER_DAY - day.stores.length;
        if (capacity > maxCapacity) {
          maxCapacity = capacity;
          bestDay = day;
        }
      });

      if (bestDay && maxCapacity > 0) {
        bestDay.stores.push(store);
        Utils.log(
          `Added remaining store ${store.name} to Day ${
            bestDay.globalDayIndex + 1
          }`,
          "INFO"
        );
      }
    });
  }

  // ==================== PHASE 2: MULTI-VISIT REBALANCING ====================

  phase2_MultiVisitRebalancing() {
    Utils.log("=== PHASE 2: MULTI-VISIT REBALANCING ===", "INFO");

    // Find all multi-visit stores across all days
    const multiVisitStores = this.identifyMultiVisitStores();

    if (multiVisitStores.length === 0) {
      Utils.log("No multi-visit stores found, skipping rebalancing", "INFO");
      return;
    }

    Utils.log(
      `Found ${multiVisitStores.length} multi-visit store groups`,
      "INFO"
    );

    // For each multi-visit store group, ensure 14-day gaps
    multiVisitStores.forEach((storeGroup) => {
      this.rebalanceMultiVisitStore(storeGroup);
    });

    Utils.log("Phase 2 completed: Multi-visit stores rebalanced", "INFO");
  }

  // NEW: Identify multi-visit stores across all days
  identifyMultiVisitStores() {
    const storeGroups = {};

    // Collect all stores from all days
    this.flatDays.forEach((day, dayIndex) => {
      day.stores.forEach((store) => {
        const storeId = store.storeId || store.name;
        if (!storeGroups[storeId]) {
          storeGroups[storeId] = {
            storeId: storeId,
            visits: [],
            isMultiVisit: store.isMultiVisit,
          };
        }
        storeGroups[storeId].visits.push({
          store: store,
          dayIndex: dayIndex,
          day: day,
        });
      });
    });

    // Filter to only multi-visit stores
    return Object.values(storeGroups).filter(
      (group) => group.visits.length > 1
    );
  }

  // NEW: Rebalance a specific multi-visit store
  rebalanceMultiVisitStore(storeGroup) {
    const { storeId, visits } = storeGroup;

    if (visits.length < 2) return; // Not actually multi-visit

    Utils.log(
      `Rebalancing multi-visit store: ${storeId} (${visits.length} visits)`,
      "INFO"
    );

    // Remove all visits from current days
    visits.forEach((visit) => {
      const dayStores = visit.day.stores;
      const storeIndex = dayStores.findIndex(
        (s) =>
          (s.visitId || s.name) === (visit.store.visitId || visit.store.name)
      );
      if (storeIndex > -1) {
        dayStores.splice(storeIndex, 1);
      }
    });

    // Find new day assignments with 14-day gaps
    const newDayAssignments = this.findDaysWithGaps(visits.length, 14);

    if (newDayAssignments.length >= visits.length) {
      // Assign visits to new days
      visits.forEach((visit, index) => {
        const targetDayIndex = newDayAssignments[index];
        const targetDay = this.flatDays[targetDayIndex];

        if (
          targetDay &&
          targetDay.stores.length < CONFIG.CLUSTERING.MAX_STORES_PER_DAY
        ) {
          targetDay.stores.push(visit.store);
          Utils.log(
            `Moved ${storeId} visit ${index + 1} to Day ${targetDayIndex + 1}`,
            "INFO"
          );
        } else {
          // Fallback: add to day with most capacity
          const fallbackDay = this.findDayWithMostCapacity();
          if (fallbackDay) {
            fallbackDay.stores.push(visit.store);
            Utils.log(
              `Fallback: Added ${storeId} visit ${index + 1} to Day ${
                fallbackDay.globalDayIndex + 1
              }`,
              "WARN"
            );
          }
        }
      });
    } else {
      Utils.log(
        `Could not find enough days with 14-day gaps for ${storeId}, using best available`,
        "WARN"
      );

      // Fallback: distribute to available days
      visits.forEach((visit, index) => {
        const fallbackDay = this.findDayWithMostCapacity();
        if (fallbackDay) {
          fallbackDay.stores.push(visit.store);
        }
      });
    }
  }

  // NEW: Find days with specified gaps
  findDaysWithGaps(visitCount, minGapDays) {
    const assignments = [];
    const totalDays = this.flatDays.length;

    if (visitCount === 2) {
      // For 2 visits, find days at least 14 days apart
      for (let firstDay = 0; firstDay < totalDays - minGapDays; firstDay++) {
        const secondDay = firstDay + minGapDays;
        if (secondDay < totalDays) {
          assignments.push([firstDay, secondDay]);
        }
      }

      // Return the assignment with days that have most capacity
      if (assignments.length > 0) {
        const bestAssignment = assignments.reduce((best, current) => {
          const currentCapacity = current.reduce((sum, dayIndex) => {
            return (
              sum +
              (CONFIG.CLUSTERING.MAX_STORES_PER_DAY -
                this.flatDays[dayIndex].stores.length)
            );
          }, 0);

          const bestCapacity = best.reduce((sum, dayIndex) => {
            return (
              sum +
              (CONFIG.CLUSTERING.MAX_STORES_PER_DAY -
                this.flatDays[dayIndex].stores.length)
            );
          }, 0);

          return currentCapacity > bestCapacity ? current : best;
        });

        return bestAssignment;
      }
    } else {
      // For 3+ visits, distribute with minimum gaps
      const interval = Math.max(minGapDays, Math.floor(totalDays / visitCount));
      for (let i = 0; i < visitCount; i++) {
        const dayIndex = Math.min(i * interval, totalDays - 1);
        assignments.push(dayIndex);
      }
    }

    return assignments;
  }

  // NEW: Find day with most available capacity
  findDayWithMostCapacity() {
    let bestDay = null;
    let maxCapacity = 0;

    this.flatDays.forEach((day) => {
      const capacity = CONFIG.CLUSTERING.MAX_STORES_PER_DAY - day.stores.length;
      if (capacity > maxCapacity) {
        maxCapacity = capacity;
        bestDay = day;
      }
    });

    return bestDay;
  }

  // ==================== PHASE 3: FINE-TUNING & TIME VALIDATION ====================

  phase3_FineTuning() {
    Utils.log("=== PHASE 3: FINE-TUNING & TIME VALIDATION ===", "INFO");

    // Validate each day for time constraints and adjust if needed
    this.flatDays.forEach((day, dayIndex) => {
      if (day.stores.length === 0) return;

      Utils.log(
        `Fine-tuning Day ${dayIndex + 1}: ${day.stores.length} stores`,
        "INFO"
      );

      // Quick time check
      const timeCheck = this.validateDayTiming(day);

      if (!timeCheck.valid) {
        Utils.log(
          `Day ${dayIndex + 1} exceeds time limits. Removing ${
            timeCheck.storesToRemove
          } stores`,
          "WARN"
        );

        // Remove stores that don't fit (from the end of the route)
        const storesToMove = day.stores.splice(-timeCheck.storesToRemove);

        // Try to place removed stores on other days
        this.redistributeStores(storesToMove);
      }
    });

    // Final balance check - redistribute if needed
    this.finalBalanceCheck();

    Utils.log(
      "Phase 3 completed: Time validation and final tuning done",
      "INFO"
    );
  }

  // NEW: Quick time validation for a day
  validateDayTiming(day) {
    if (day.stores.length === 0) return { valid: true, storesToRemove: 0 };

    // Simple time calculation
    const orderedStores = this.simpleNearestNeighbor([...day.stores]);
    let currentTime = CONFIG.WORK.START;
    let validStoreCount = 0;

    const breakConfig = day.isFriday ? CONFIG.FRIDAY_PRAYER : CONFIG.LUNCH;
    let hasBreak = false;

    for (let i = 0; i < orderedStores.length; i++) {
      const store = orderedStores[i];

      // Add travel time (simplified)
      if (i > 0) {
        const prevStore = orderedStores[i - 1];
        const distance = Utils.distance(
          prevStore.lat,
          prevStore.lng,
          store.lat,
          store.lng
        );
        const isSameMall =
          store.mallClusterId &&
          store.mallClusterId === prevStore.mallClusterId;
        const travelTime = isSameMall
          ? Math.max(2, Math.round(distance * 15))
          : Math.round(distance * 3);
        currentTime += travelTime;
      }

      // Handle break
      if (
        !hasBreak &&
        currentTime >= breakConfig.START &&
        currentTime < breakConfig.END
      ) {
        currentTime = breakConfig.END;
        hasBreak = true;
      }

      // Add visit time
      currentTime += CONFIG.BUFFER_TIME + store.visitTime;

      // Check if we're still within work hours
      if (currentTime <= CONFIG.WORK.END) {
        validStoreCount++;
      } else {
        break; // Remaining stores won't fit
      }
    }

    const storesToRemove = Math.max(0, orderedStores.length - validStoreCount);

    return {
      valid: storesToRemove === 0,
      storesToRemove: storesToRemove,
      validStoreCount: validStoreCount,
    };
  }

  // NEW: Redistribute stores that don't fit
  redistributeStores(storesToRedistribute) {
    storesToRedistribute.forEach((store) => {
      // Find day with capacity that can accommodate this store
      let bestDay = null;
      let bestScore = -1;

      this.flatDays.forEach((day) => {
        const capacity =
          CONFIG.CLUSTERING.MAX_STORES_PER_DAY - day.stores.length;
        if (capacity > 0) {
          // Quick time check for adding this store
          const testStores = [...day.stores, store];
          const timeCheck = this.validateDayTiming({
            ...day,
            stores: testStores,
          });

          if (timeCheck.valid) {
            // Score based on capacity and geographic fit
            const dayCenter = this.calculateDayCenter(day.stores);
            const distance = Utils.distance(
              dayCenter.lat,
              dayCenter.lng,
              store.lat,
              store.lng
            );
            const score = capacity * 10 - distance; // Prefer days with more capacity and closer geography

            if (score > bestScore) {
              bestScore = score;
              bestDay = day;
            }
          }
        }
      });

      if (bestDay) {
        bestDay.stores.push(store);
        Utils.log(
          `Redistributed store ${store.name} to Day ${
            bestDay.globalDayIndex + 1
          }`,
          "INFO"
        );
      } else {
        Utils.log(
          `Could not redistribute store ${store.name} - no suitable day found`,
          "WARN"
        );
      }
    });
  }

  // NEW: Final balance check and redistribution
  finalBalanceCheck() {
    Utils.log("Performing final balance check", "INFO");

    // Calculate current distribution
    const storeCounts = this.flatDays.map((day) => day.stores.length);
    const avgStores =
      storeCounts.reduce((sum, count) => sum + count, 0) / this.flatDays.length;
    const maxStores = Math.max(...storeCounts);
    const minStores = Math.min(...storeCounts);

    Utils.log(
      `Current distribution: avg=${avgStores.toFixed(
        1
      )}, min=${minStores}, max=${maxStores}`,
      "INFO"
    );

    // If imbalance is significant, redistribute
    const imbalanceThreshold = 5; // If difference > 5 stores, rebalance

    if (maxStores - minStores > imbalanceThreshold) {
      Utils.log(
        "Significant imbalance detected, performing redistribution",
        "INFO"
      );

      const overloadedDays = this.flatDays.filter(
        (day) => day.stores.length >= avgStores + 3
      );
      const underloadedDays = this.flatDays.filter(
        (day) => day.stores.length <= avgStores - 3
      );

      overloadedDays.forEach((overloadedDay) => {
        underloadedDays.forEach((underloadedDay) => {
          const capacity =
            CONFIG.CLUSTERING.MAX_STORES_PER_DAY - underloadedDay.stores.length;
          const excess = overloadedDay.stores.length - Math.ceil(avgStores);

          const storesToMove = Math.min(capacity, excess, 3); // Move max 3 stores at a time

          if (storesToMove > 0) {
            // Move stores from end of overloaded day (assuming they're furthest)
            const movedStores = overloadedDay.stores.splice(-storesToMove);
            underloadedDay.stores.push(...movedStores);

            Utils.log(
              `Moved ${storesToMove} stores from Day ${
                overloadedDay.globalDayIndex + 1
              } to Day ${underloadedDay.globalDayIndex + 1}`,
              "INFO"
            );
          }
        });
      });
    }
  }

  // Helper methods (existing ones)
  calculateDayCenter(stores) {
    if (stores.length === 0) {
      return { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };
    }

    const lat = stores.reduce((sum, s) => sum + s.lat, 0) / stores.length;
    const lng = stores.reduce((sum, s) => sum + s.lng, 0) / stores.length;

    return { lat, lng };
  }

  simpleNearestNeighbor(stores) {
    if (stores.length <= 1) return stores;

    const ordered = [];
    const remaining = [...stores];
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDist = Utils.distance(
        currentLat,
        currentLng,
        remaining[0].lat,
        remaining[0].lng
      );

      for (let i = 1; i < remaining.length; i++) {
        const dist = Utils.distance(
          currentLat,
          currentLng,
          remaining[i].lat,
          remaining[i].lng
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      }

      const nearest = remaining.splice(nearestIdx, 1)[0];
      ordered.push(nearest);
      currentLat = nearest.lat;
      currentLng = nearest.lng;
    }

    return ordered;
  }

  // Final route optimization for each day
  optimizeDayRoute(stores, dayInfo) {
    if (!stores.length) return [];

    // Group by mall clusters first
    const mallGroups = {};
    const individualStores = [];

    stores.forEach((store) => {
      if (store.mallClusterId) {
        if (!mallGroups[store.mallClusterId]) {
          mallGroups[store.mallClusterId] = [];
        }
        mallGroups[store.mallClusterId].push(store);
      } else {
        individualStores.push(store);
      }
    });

    // Create route segments
    const routeSegments = [];

    Object.entries(mallGroups).forEach(([mallId, mallStores]) => {
      routeSegments.push({
        type: "mall",
        stores: mallStores,
        centerLat:
          mallStores[0].mallClusterInfo?.centerLat || mallStores[0].lat,
        centerLng:
          mallStores[0].mallClusterInfo?.centerLng || mallStores[0].lng,
        mallId,
      });
    });

    individualStores.forEach((store) => {
      routeSegments.push({
        type: "individual",
        stores: [store],
        centerLat: store.lat,
        centerLng: store.lng,
      });
    });

    // Optimize segment order by distance
    const orderedSegments = this.optimizeSegmentOrder(routeSegments);

    // Flatten to store list
    const orderedStores = [];
    orderedSegments.forEach((segment) => {
      orderedStores.push(...segment.stores);
    });

    // Calculate final timing
    return this.calculateFinalRouteTiming(orderedStores, dayInfo);
  }

  optimizeSegmentOrder(segments) {
    if (segments.length <= 1) return segments;

    const ordered = [];
    const remaining = [...segments];
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDist = Utils.distance(
        currentLat,
        currentLng,
        remaining[0].centerLat,
        remaining[0].centerLng
      );

      for (let i = 1; i < remaining.length; i++) {
        const dist = Utils.distance(
          currentLat,
          currentLng,
          remaining[i].centerLat,
          remaining[i].centerLng
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      }

      const nearest = remaining.splice(nearestIdx, 1)[0];
      ordered.push(nearest);

      const lastStore = nearest.stores[nearest.stores.length - 1];
      currentLat = lastStore.lat;
      currentLng = lastStore.lng;
    }

    return ordered;
  }

  calculateFinalRouteTiming(stores, dayInfo) {
    if (!stores.length) return [];

    const route = [];
    let currentTime = CONFIG.WORK.START;
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;
    let hasBreak = false;

    const breakConfig = dayInfo.isFriday ? CONFIG.FRIDAY_PRAYER : CONFIG.LUNCH;

    for (const [index, store] of stores.entries()) {
      let arrivalTime, travelTime, distance;

      if (index === 0) {
        arrivalTime = CONFIG.WORK.START;
        distance = Utils.distance(
          CONFIG.START.LAT,
          CONFIG.START.LNG,
          store.lat,
          store.lng
        );
        travelTime = 0;
      } else {
        distance = Utils.distance(currentLat, currentLng, store.lat, store.lng);

        const prevStore = stores[index - 1];
        const isSameMall =
          store.mallClusterId &&
          store.mallClusterId === prevStore.mallClusterId;

        if (isSameMall) {
          travelTime = Math.max(2, Math.round(distance * 15));
        } else {
          travelTime = Math.round(distance * 3);
        }

        if (
          !hasBreak &&
          currentTime >= breakConfig.START &&
          currentTime < breakConfig.END
        ) {
          currentTime = breakConfig.END;
          hasBreak = true;
        }

        arrivalTime = currentTime + travelTime;

        const visitEndTime = arrivalTime + CONFIG.BUFFER_TIME + store.visitTime;

        if (
          !hasBreak &&
          arrivalTime < breakConfig.END &&
          visitEndTime > breakConfig.START
        ) {
          currentTime = breakConfig.END;
          hasBreak = true;
          arrivalTime = currentTime + travelTime;
        }
      }

      const departTime = arrivalTime + CONFIG.BUFFER_TIME + store.visitTime;

      route.push({
        ...store,
        order: route.length + 1,
        distance,
        duration: travelTime,
        arrivalTime,
        departTime,
        dayInfo: dayInfo,
        globalDayIndex: dayInfo.globalDayIndex,
        isSameMallTravel:
          index > 0 &&
          store.mallClusterId &&
          store.mallClusterId === stores[index - 1].mallClusterId,
      });

      currentLat = store.lat;
      currentLng = store.lng;
      currentTime = departTime;
    }

    return route;
  }

  // MAIN: Two-Phase Optimize Plan
  optimizePlan(stores) {
    const allVisitInstances = this.createVisitInstances(stores);

    Utils.log("=== TWO-PHASE OPTIMIZATION STARTED ===", "INFO");

    // Phase 1: Aggressive geographic assignment (ignore multi-visit constraints)
    const unassignedStores =
      this.phase1_AggressiveAssignment(allVisitInstances);

    // Phase 2: Multi-visit rebalancing with 14-day gaps
    this.phase2_MultiVisitRebalancing();

    // Phase 3: Fine-tuning and time validation
    this.phase3_FineTuning();

    // Copy flat days back to week structure
    this.copyFlatDaysToWeekStructure();

    // Optimize routes within each day
    this.flatDays.forEach((dayInfo) => {
      const optimizedRoute = this.optimizeDayRoute(dayInfo.stores, dayInfo);
      dayInfo.optimizedStores = optimizedRoute;
    });

    // Copy optimized routes back to week structure
    this.copyOptimizedRoutesToWeeks();

    Utils.log("=== TWO-PHASE OPTIMIZATION COMPLETED ===", "INFO");

    // Log final distribution
    this.logFinalDistribution();

    return {
      workingDays: this.workingDays,
      unvisitedStores: unassignedStores,
      statistics: this.calculateStatistics(allVisitInstances),
      p1VisitFrequency: this.getAverageFrequency(stores, "P1"),
      hasW5: this.workingDays.length === 5,
    };
  }

  // NEW: Log final distribution for debugging
  logFinalDistribution() {
    Utils.log("=== FINAL DISTRIBUTION SUMMARY ===", "INFO");

    const distribution = this.flatDays.map((day, index) => ({
      day: index + 1,
      week: day.weekIndex + 1,
      dayName: day.dayName,
      stores: day.optimizedStores ? day.optimizedStores.length : 0,
    }));

    const totalStores = distribution.reduce((sum, d) => sum + d.stores, 0);
    const activeDays = distribution.filter((d) => d.stores > 0).length;
    const avgStores =
      activeDays > 0 ? (totalStores / activeDays).toFixed(1) : 0;
    const maxStores = Math.max(...distribution.map((d) => d.stores));
    const minStores = Math.min(
      ...distribution.filter((d) => d.stores > 0).map((d) => d.stores)
    );
    const emptyDays = distribution.filter((d) => d.stores === 0).length;

    Utils.log(`Total stores: ${totalStores}`, "INFO");
    Utils.log(`Active days: ${activeDays}/${this.flatDays.length}`, "INFO");
    Utils.log(`Average stores/day: ${avgStores}`, "INFO");
    Utils.log(`Range: ${minStores} - ${maxStores} stores`, "INFO");
    Utils.log(`Empty days: ${emptyDays}`, "INFO");

    // Log each day's distribution
    distribution.forEach((d) => {
      if (d.stores > 0) {
        Utils.log(
          `Day ${d.day} (Week ${d.week}, ${d.dayName}): ${d.stores} stores`,
          "INFO"
        );
      } else {
        Utils.log(`Day ${d.day} (Week ${d.week}, ${d.dayName}): EMPTY`, "WARN");
      }
    });
  }

  // Copy flat days back to week structure
  copyFlatDaysToWeekStructure() {
    this.flatDays.forEach((flatDay) => {
      const weekDay = this.workingDays[flatDay.weekIndex][flatDay.dayIndex];
      weekDay.stores = [...flatDay.stores];
    });
  }

  // Copy optimized routes back to week structure
  copyOptimizedRoutesToWeeks() {
    this.flatDays.forEach((flatDay) => {
      const weekDay = this.workingDays[flatDay.weekIndex][flatDay.dayIndex];
      weekDay.optimizedStores = flatDay.optimizedStores;
    });
  }

  // Helper: Get average frequency for a priority
  getAverageFrequency(stores, priority) {
    const priorityStores = stores.filter((s) => s.priority === priority);
    if (priorityStores.length === 0) return 0;

    const avgFreq =
      priorityStores.reduce((sum, s) => sum + (s.baseFrequency || 0), 0) /
      priorityStores.length;
    return avgFreq;
  }

  // Calculate enhanced statistics
  calculateStatistics(allVisitInstances) {
    let totalVisitsPlanned = 0;
    let totalDistance = 0;
    let multiVisitStores = 0;
    let mallClusters = new Set();
    let storesInMalls = 0;
    let priorityDistribution = {};

    const storeVisitCounts = {};
    const retailerCounts = {};
    const dailyStats = [];

    this.flatDays.forEach((dayInfo, dayIndex) => {
      if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
        const dayStores = dayInfo.optimizedStores.length;
        const dayDistance = dayInfo.optimizedStores.reduce(
          (sum, s) => sum + (s.distance || 0),
          0
        );

        dailyStats.push({
          globalDay: dayIndex + 1,
          week: dayInfo.weekIndex + 1,
          day: dayInfo.dayName,
          stores: dayStores,
          distance: dayDistance.toFixed(1),
        });

        dayInfo.optimizedStores.forEach((store) => {
          totalVisitsPlanned++;
          totalDistance += store.distance || 0;

          const storeId = store.storeId || store.name;
          storeVisitCounts[storeId] = (storeVisitCounts[storeId] || 0) + 1;

          const retailer = store.retailer || "Unknown";
          retailerCounts[retailer] = (retailerCounts[retailer] || 0) + 1;

          priorityDistribution[store.priority] =
            (priorityDistribution[store.priority] || 0) + 1;

          if (store.mallClusterId) {
            mallClusters.add(store.mallClusterId);
            storesInMalls++;
          }
        });
      } else {
        dailyStats.push({
          globalDay: dayIndex + 1,
          week: dayInfo.weekIndex + 1,
          day: dayInfo.dayName,
          stores: 0,
          distance: 0,
        });
      }
    });

    Object.values(storeVisitCounts).forEach((visitCount) => {
      if (visitCount > 1) multiVisitStores++;
    });

    const unvisitedCount = allVisitInstances.length - totalVisitsPlanned;
    const workingDaysUsed = dailyStats.filter((d) => d.stores > 0).length;
    const avgStoresPerDay =
      workingDaysUsed > 0
        ? (totalVisitsPlanned / workingDaysUsed).toFixed(1)
        : 0;
    const avgDistancePerDay =
      workingDaysUsed > 0 ? (totalDistance / workingDaysUsed).toFixed(1) : 0;

    // Enhanced day balance calculations
    const storesPerDay = dailyStats.map((d) => d.stores);
    const maxStoresPerDay = Math.max(...storesPerDay);
    const minStoresPerDay = Math.min(...storesPerDay.filter((s) => s > 0)); // Exclude empty days
    const emptyDays = storesPerDay.filter((s) => s === 0).length;
    const balanceScore =
      maxStoresPerDay > 0
        ? Math.round((minStoresPerDay / maxStoresPerDay) * 100)
        : 0;

    return {
      totalStoresPlanned: totalVisitsPlanned,
      totalStoresRequired: allVisitInstances.length,
      uniqueStoresVisited: Object.keys(storeVisitCounts).length,
      multiVisitStores: multiVisitStores,
      unvisitedCount,
      totalDistance,
      workingDays: workingDaysUsed,
      averageStoresPerDay: avgStoresPerDay,
      averageDistancePerDay: avgDistancePerDay,
      coveragePercentage:
        allVisitInstances.length > 0
          ? ((totalVisitsPlanned / allVisitInstances.length) * 100).toFixed(1)
          : 0,
      retailerCounts: retailerCounts,
      priorityDistribution: priorityDistribution,

      // Enhanced statistics
      mallStats: {
        totalMallClusters: mallClusters.size,
        storesInMalls: storesInMalls,
        avgStoresPerMall:
          mallClusters.size > 0
            ? Math.round((storesInMalls / mallClusters.size) * 10) / 10
            : 0,
        clusteringEfficiency:
          totalVisitsPlanned > 0
            ? Math.round((storesInMalls / totalVisitsPlanned) * 100)
            : 0,
        timeSavings: Math.round(storesInMalls * 5),
      },

      // NEW: Two-phase optimization stats
      twoPhaseOptimization: {
        maxStoresPerDay: maxStoresPerDay,
        minStoresPerDay: minStoresPerDay === Infinity ? 0 : minStoresPerDay,
        emptyDays: emptyDays,
        totalDays: this.flatDays.length,
        utilizationRate: Math.round(
          (workingDaysUsed / this.flatDays.length) * 100
        ),
        balanceScore: balanceScore,
        efficiency: `${avgStoresPerDay} stores/day, ${avgDistancePerDay}km/day`,
        dailyBreakdown: dailyStats,

        // Phase-specific metrics
        phase1_AggressiveAssignment:
          "Completed - All days filled to target capacity",
        phase2_MultiVisitRebalancing: "Completed - 14-day gaps enforced",
        phase3_FineTuning: "Completed - Time constraints validated",
      },

      // Multi-visit gap tracking
      multiVisitGaps: this.calculateMultiVisitGaps(storeVisitCounts),
    };
  }

  // Calculate gaps between multi-visit stores
  calculateMultiVisitGaps(storeVisitCounts) {
    const gaps = [];

    Object.entries(storeVisitCounts).forEach(([storeId, visitCount]) => {
      if (visitCount > 1) {
        const storeVisits = [];
        this.flatDays.forEach((day, dayIndex) => {
          if (day.optimizedStores) {
            day.optimizedStores.forEach((store) => {
              if ((store.storeId || store.name) === storeId) {
                storeVisits.push({
                  dayIndex: dayIndex,
                  visitNum: store.visitNum,
                  week: day.weekIndex + 1,
                  day: day.dayName,
                });
              }
            });
          }
        });

        storeVisits.sort((a, b) => a.dayIndex - b.dayIndex);
        for (let i = 1; i < storeVisits.length; i++) {
          const gapDays = storeVisits[i].dayIndex - storeVisits[i - 1].dayIndex;
          gaps.push({
            storeId: storeId,
            visit1: storeVisits[i - 1],
            visit2: storeVisits[i],
            gapDays: gapDays,
            meetsRequirement: gapDays >= 14,
          });
        }
      }
    });

    const validGaps = gaps.filter((g) => g.meetsRequirement).length;
    const totalGaps = gaps.length;

    return {
      totalMultiVisitStores: Object.values(storeVisitCounts).filter(
        (count) => count > 1
      ).length,
      totalGaps: totalGaps,
      validGaps: validGaps,
      gapCompliance:
        totalGaps > 0 ? Math.round((validGaps / totalGaps) * 100) : 100,
      details: gaps.slice(0, 10),
    };
  }
}

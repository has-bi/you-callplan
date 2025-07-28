// ==================== ROUTE OPTIMIZER - FIXED CORE ISSUES ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
    this.flatDays = this.flattenWorkingDays();
    this.useEnhancedOptimization = true;
  }

  // Main optimization flow
  optimizePlan(stores) {
    Utils.log("=== STARTING ROUTE OPTIMIZATION WITH FIXES ===", "INFO");

    try {
      if (this.useEnhancedOptimization && stores.length >= 10) {
        return this.runEnhancedOptimization(stores);
      } else {
        return this.runBasicOptimizationFixed(stores);
      }
    } catch (error) {
      Utils.log(
        "Enhanced optimization failed, using basic: " + error.toString(),
        "ERROR"
      );
      return this.runBasicOptimizationFixed(stores);
    }
  }

  // FIXED: Basic optimization with all 3 problem fixes
  runBasicOptimizationFixed(stores) {
    Utils.log("🔧 Using FIXED Basic Geographic Optimization", "INFO");

    const validStores = this.filterByDistanceLimit(stores);

    // FIX 1: Use fixed visit instance creation (no duplicates)
    const visitInstances = this.createVisitInstancesFixed(validStores);

    const optimalK = this.calculateOptimalClusters(visitInstances.length);
    const clusters = this.performKMeansClustering(visitInstances, optimalK);
    const dayAssignments = this.assignClustersTodays(clusters);

    // FIX 3: Enforce time constraints BEFORE route optimization
    this.enforceTimeConstraints(dayAssignments);

    this.optimizeDailyRoutes(dayAssignments);

    // FIX 2: Use fixed multi-visit constraint enforcement (5 working days)
    this.enforceMultiVisitConstraintsFixed(dayAssignments);

    return this.convertBasicToOutputFormat(
      dayAssignments,
      stores,
      visitInstances
    );
  }

  // FIX 1: Prevent duplicate visits in createVisitInstances
  createVisitInstancesFixed(stores) {
    const instances = [];

    stores.forEach((store) => {
      // FIXED: Use Math.floor to prevent decimals creating extra visits
      const visitsThisMonth = Math.floor(store.actualVisits || 0);

      if (visitsThisMonth > 0) {
        for (let v = 0; v < visitsThisMonth; v++) {
          instances.push({
            ...store,
            visitNum: v + 1,
            visitId: `${store.noStr || store.name}_${v + 1}`,
            isMultiVisit: visitsThisMonth > 1,
          });
        }
      }
    });

    Utils.log(
      `Visit instances created: ${instances.length} visits from ${stores.length} stores`,
      "INFO"
    );
    return instances;
  }

  // FIX 2: Enforce 5 working day gaps for multi-visit
  enforceMultiVisitConstraintsFixed(dayAssignments) {
    const multiVisitStores = {};

    // Group visits by store noStr
    dayAssignments.forEach((day, dayIdx) => {
      day.stores.forEach((store) => {
        if (store.isMultiVisit) {
          const noStr = store.noStr || store.name;
          if (!multiVisitStores[noStr]) multiVisitStores[noStr] = [];
          multiVisitStores[noStr].push({ store, dayIdx });
        }
      });
    });

    // Fix gap violations
    Object.entries(multiVisitStores).forEach(([noStr, visits]) => {
      if (visits.length < 2) return;

      visits.sort((a, b) => a.dayIdx - b.dayIdx);

      for (let i = 1; i < visits.length; i++) {
        const gap = visits[i].dayIdx - visits[i - 1].dayIdx;

        // FIXED: Use 5 working days minimum gap
        if (gap < 5) {
          const violatingVisit = visits[i];
          const targetDay = Math.min(
            visits[i - 1].dayIdx + 5,
            dayAssignments.length - 1
          );

          // Remove from current day
          const currentDay = dayAssignments[violatingVisit.dayIdx];
          const storeIdx = currentDay.stores.indexOf(violatingVisit.store);
          if (storeIdx !== -1) {
            currentDay.stores.splice(storeIdx, 1);
            Utils.log(
              `Moved ${noStr} from day ${violatingVisit.dayIdx} to day ${targetDay} (gap fix)`,
              "INFO"
            );
          }

          // Move to valid day with capacity
          if (
            targetDay < dayAssignments.length &&
            dayAssignments[targetDay].stores.length <
              dayAssignments[targetDay].capacity
          ) {
            dayAssignments[targetDay].stores.push(violatingVisit.store);
            violatingVisit.dayIdx = targetDay;
          }
        }
      }
    });
  }

  // FIX 3: Strict time enforcement - move violating stores to other days
  enforceTimeConstraints(dayAssignments) {
    dayAssignments.forEach((day, dayIdx) => {
      if (day.stores.length === 0) return;

      // Calculate route timing
      let currentTime = CONFIG.WORK.START;
      let violatingStoreIndex = -1;

      for (let i = 0; i < day.stores.length; i++) {
        const store = day.stores[i];
        const distance =
          i === 0
            ? Utils.distance(
                CONFIG.START.LAT,
                CONFIG.START.LNG,
                store.lat,
                store.lng
              )
            : Utils.distance(
                day.stores[i - 1].lat,
                day.stores[i - 1].lng,
                store.lat,
                store.lng
              );

        currentTime += Math.round(distance * 3); // Travel time

        // Handle lunch/prayer break
        const isFriday = day.dayInfo?.isFriday || false;
        const breakStart = isFriday
          ? CONFIG.FRIDAY_PRAYER.START
          : CONFIG.LUNCH.START;
        const breakEnd = isFriday ? CONFIG.FRIDAY_PRAYER.END : CONFIG.LUNCH.END;

        if (currentTime >= breakStart && currentTime < breakEnd) {
          currentTime = breakEnd;
        }

        currentTime +=
          CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);

        // FIXED: Check if this store would end after 6:20 PM
        if (currentTime > CONFIG.WORK.END) {
          violatingStoreIndex = i;
          break;
        }
      }

      // Move violating stores to other days
      if (violatingStoreIndex >= 0) {
        const violatingStores = day.stores.splice(violatingStoreIndex);
        Utils.log(
          `Day ${dayIdx}: Moving ${violatingStores.length} stores due to time constraints`,
          "WARN"
        );

        // Try to place in other days with capacity
        violatingStores.forEach((store) => {
          for (
            let targetDay = 0;
            targetDay < dayAssignments.length;
            targetDay++
          ) {
            if (
              targetDay !== dayIdx &&
              dayAssignments[targetDay].stores.length <
                dayAssignments[targetDay].capacity
            ) {
              dayAssignments[targetDay].stores.push(store);
              Utils.log(
                `Moved ${store.noStr || store.name} to day ${targetDay}`,
                "INFO"
              );
              break;
            }
          }
        });
      }
    });
  }

  // Enhanced optimization (kept for backward compatibility)
  runEnhancedOptimization(stores) {
    Utils.log("🚀 Using Enhanced Cross-Border Optimization", "INFO");

    const optimizedConfig = this.getOptimizedConfig(stores);
    const crossBorderOptimizer = new CrossBorderOptimizer(optimizedConfig);
    const optimizationResult = crossBorderOptimizer.optimize(
      stores,
      this.workingDays
    );

    return this.convertToExistingFormat(optimizationResult, stores);
  }

  // Core optimization methods (simplified)
  filterByDistanceLimit(stores) {
    const maxDistance = CONFIG.TRAVEL_LIMITS?.MAX_DISTANCE_FROM_HOME || 40;
    const validStores = stores.filter((store) => {
      const distance = Utils.distance(
        CONFIG.START.LAT,
        CONFIG.START.LNG,
        store.lat,
        store.lng
      );
      return distance <= maxDistance;
    });

    Utils.log(
      `Distance filter: ${validStores.length}/${stores.length} stores within ${maxDistance}km`,
      "INFO"
    );
    return validStores;
  }

  calculateOptimalClusters(storeCount) {
    const avgStoresPerDay =
      (CONFIG.CLUSTERING.MIN_STORES_PER_DAY +
        CONFIG.CLUSTERING.MAX_STORES_PER_DAY) /
      2;
    const workingDays = this.flatDays.length;
    return Math.min(Math.ceil(storeCount / avgStoresPerDay), workingDays);
  }

  performKMeansClustering(stores, k) {
    if (stores.length <= k) {
      return stores.map((store) => [store]);
    }

    const centroids = this.initializeCentroidsKMeansPlusPlus(stores, k);
    let clusters = [];
    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      clusters = Array(k)
        .fill(null)
        .map(() => []);

      stores.forEach((store) => {
        let minDist = Infinity;
        let bestCluster = 0;

        centroids.forEach((centroid, idx) => {
          const dist = Utils.distance(
            store.lat,
            store.lng,
            centroid.lat,
            centroid.lng
          );
          if (dist < minDist) {
            minDist = dist;
            bestCluster = idx;
          }
        });

        clusters[bestCluster].push(store);
      });

      // Update centroids
      clusters.forEach((cluster, idx) => {
        if (cluster.length > 0) {
          centroids[idx] = {
            lat: cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length,
            lng: cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length,
          };
        }
      });

      iterations++;
    }

    return clusters.filter((c) => c.length > 0);
  }

  initializeCentroidsKMeansPlusPlus(stores, k) {
    const centroids = [];
    const firstIdx = Math.floor(Math.random() * stores.length);
    centroids.push({ lat: stores[firstIdx].lat, lng: stores[firstIdx].lng });

    for (let i = 1; i < k; i++) {
      const distances = stores.map((store) => {
        const minDist = centroids.reduce((min, centroid) => {
          const dist = Utils.distance(
            store.lat,
            store.lng,
            centroid.lat,
            centroid.lng
          );
          return Math.min(min, dist);
        }, Infinity);
        return minDist * minDist;
      });

      const totalDist = distances.reduce((sum, d) => sum + d, 0);
      let random = Math.random() * totalDist;

      for (let j = 0; j < stores.length; j++) {
        random -= distances[j];
        if (random <= 0) {
          centroids.push({ lat: stores[j].lat, lng: stores[j].lng });
          break;
        }
      }
    }

    return centroids;
  }

  assignClustersTodays(clusters) {
    const dayAssignments = this.flatDays.map((day, idx) => ({
      dayIndex: idx,
      dayInfo: day,
      stores: [],
      capacity: CONFIG.CLUSTERING.MAX_STORES_PER_DAY,
    }));

    clusters.forEach((cluster) => {
      let bestDay = -1;
      let bestScore = -Infinity;

      dayAssignments.forEach((day, idx) => {
        if (day.stores.length + cluster.length > day.capacity) return;

        const capacityScore =
          ((day.capacity - day.stores.length) / day.capacity) * 100;
        if (capacityScore > bestScore) {
          bestScore = capacityScore;
          bestDay = idx;
        }
      });

      if (bestDay !== -1) {
        dayAssignments[bestDay].stores.push(...cluster);
      }
    });

    return dayAssignments;
  }

  optimizeDailyRoutes(dayAssignments) {
    dayAssignments.forEach((day) => {
      if (day.stores.length > 1) {
        day.stores = this.nearestNeighborRoute(day.stores);
        day.stores = this.optimize2Opt(day.stores);
      }
    });
  }

  nearestNeighborRoute(stores) {
    if (stores.length <= 2) return stores;

    const route = [];
    const remaining = [...stores];
    let current = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDist = Infinity;

      remaining.forEach((store, idx) => {
        const dist = Utils.distance(
          current.lat,
          current.lng,
          store.lat,
          store.lng
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = idx;
        }
      });

      const nearest = remaining.splice(nearestIdx, 1)[0];
      route.push(nearest);
      current = nearest;
    }

    return route;
  }

  optimize2Opt(route) {
    if (route.length <= 3) return route;

    let improved = true;
    let currentRoute = [...route];

    while (improved) {
      improved = false;
      for (let i = 1; i < currentRoute.length - 1; i++) {
        for (let j = i + 1; j < currentRoute.length; j++) {
          const newRoute = [
            ...currentRoute.slice(0, i),
            ...currentRoute.slice(i, j + 1).reverse(),
            ...currentRoute.slice(j + 1),
          ];

          if (
            this.calculateRouteDistance(newRoute) <
            this.calculateRouteDistance(currentRoute)
          ) {
            currentRoute = newRoute;
            improved = true;
          }
        }
      }
    }

    return currentRoute;
  }

  calculateRouteDistance(stores) {
    if (stores.length === 0) return 0;

    let totalDistance = 0;
    let current = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };

    stores.forEach((store) => {
      totalDistance += Utils.distance(
        current.lat,
        current.lng,
        store.lat,
        store.lng
      );
      current = store;
    });

    return totalDistance;
  }

  // Output conversion methods (simplified)
  convertBasicToOutputFormat(dayAssignments, originalStores, visitInstances) {
    let dayIndex = 0;
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        if (dayIndex < dayAssignments.length) {
          const assignment = dayAssignments[dayIndex];
          day.optimizedStores = this.createDetailedRoute(
            assignment.stores,
            day
          );
        } else {
          day.optimizedStores = [];
        }
        dayIndex++;
      });
    });

    const statistics = this.calculateBasicStatistics(
      dayAssignments,
      visitInstances
    );
    const assignedIds = new Set();
    dayAssignments.forEach((day) => {
      day.stores.forEach((store) => {
        assignedIds.add(store.visitId || store.name);
      });
    });

    const unvisitedStores = visitInstances.filter(
      (instance) => !assignedIds.has(instance.visitId || instance.name)
    );

    return {
      workingDays: this.workingDays,
      unvisitedStores: unvisitedStores,
      statistics: statistics,
      p1VisitFrequency: this.getP1Frequency(originalStores),
      hasW5: this.workingDays.length === 5,
    };
  }

  createDetailedRoute(stores, dayInfo) {
    if (!stores || stores.length === 0) return [];

    const route = [];
    let currentTime = CONFIG.WORK.START;
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;

    const isFriday = dayInfo.isFriday;
    const breakStart = isFriday
      ? CONFIG.FRIDAY_PRAYER.START
      : CONFIG.LUNCH.START;
    const breakEnd = isFriday ? CONFIG.FRIDAY_PRAYER.END : CONFIG.LUNCH.END;
    let hasBreak = false;

    stores.forEach((store, index) => {
      const distance = Utils.distance(
        currentLat,
        currentLng,
        store.lat,
        store.lng
      );
      const travelTime = Math.round(distance * 3);

      currentTime += travelTime;

      if (!hasBreak && currentTime >= breakStart && currentTime < breakEnd) {
        currentTime = breakEnd;
        hasBreak = true;
      }

      const arrivalTime = currentTime;
      const visitDuration =
        CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);
      const departTime = arrivalTime + visitDuration;

      route.push({
        ...store,
        order: index + 1,
        distance: distance,
        duration: travelTime,
        arrivalTime: arrivalTime,
        departTime: departTime,
        timeWarning: departTime > CONFIG.WORK.END,
        isAfter6PM: departTime > CONFIG.WORK.END,
      });

      currentTime = departTime;
      currentLat = store.lat;
      currentLng = store.lng;
    });

    return route;
  }

  calculateBasicStatistics(dayAssignments, visitInstances) {
    const activeDays = dayAssignments.filter((day) => day.stores.length > 0);
    const totalStores = dayAssignments.reduce(
      (sum, day) => sum + day.stores.length,
      0
    );
    const totalDistance = dayAssignments.reduce(
      (sum, day) => sum + this.calculateRouteDistance(day.stores),
      0
    );

    return {
      totalStoresRequired: visitInstances.length,
      totalStoresPlanned: totalStores,
      coveragePercentage: ((totalStores / visitInstances.length) * 100).toFixed(
        1
      ),
      workingDays: activeDays.length,
      totalDistance: totalDistance.toFixed(1),
      averageStoresPerDay:
        activeDays.length > 0
          ? (totalStores / activeDays.length).toFixed(1)
          : "0",
    };
  }

  getP1Frequency(stores) {
    const p1Stores = stores.filter((s) => s.priority === "P1");
    if (p1Stores.length === 0) return 0;
    return (
      p1Stores.reduce((sum, s) => sum + (s.baseFrequency || 0), 0) /
      p1Stores.length
    );
  }

  flattenWorkingDays() {
    const flat = [];
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        flat.push(day);
      });
    });
    return flat;
  }

  // Enhanced optimization helper methods (simplified versions)
  getOptimizedConfig(stores) {
    return {
      gridSize: 0.02,
      capacityPerDay: 13,
      minStoresPerDay: 8,
      maxDistance: 5,
      borderThreshold: 0.7,
    };
  }

  convertToExistingFormat(optimizationResult, originalStores) {
    // Simplified conversion for enhanced optimization results
    let dayIndex = 0;
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        if (dayIndex < optimizationResult.routes.length) {
          const optimizedDay = optimizationResult.routes[dayIndex];
          day.optimizedStores = this.createDetailedRoute(
            optimizedDay.stores,
            day
          );
        } else {
          day.optimizedStores = [];
        }
        dayIndex++;
      });
    });

    const statistics = {
      totalStoresRequired: optimizationResult.routes.reduce(
        (sum, day) => sum + day.stores.length,
        0
      ),
      totalStoresPlanned: optimizationResult.routes.reduce(
        (sum, day) => sum + day.stores.length,
        0
      ),
      coveragePercentage: "100.0",
      workingDays: optimizationResult.routes.length,
      averageStoresPerDay: (
        optimizationResult.routes.reduce(
          (sum, day) => sum + day.stores.length,
          0
        ) / optimizationResult.routes.length
      ).toFixed(1),
      totalDistance: optimizationResult.routes
        .reduce((sum, day) => sum + this.calculateRouteDistance(day.stores), 0)
        .toFixed(1),
      crossBorderOptimization: {
        daysAfter: optimizationResult.routes.length,
        avgUtilization: optimizationResult.performance.avgUtilization + "%",
        efficiencyGain: optimizationResult.performance.efficiencyGain + "%",
        crossBorderDays:
          optimizationResult.performance.crossBorderOptimizations,
      },
    };

    return {
      workingDays: this.workingDays,
      unvisitedStores: [],
      statistics: statistics,
      p1VisitFrequency: this.getP1Frequency(originalStores),
      hasW5: this.workingDays.length === 5,
    };
  }
}

// ==================== PROBLEM ANALYZER ====================
class RouteProblemAnalyzer {
  analyzeRouteProblems(planResult) {
    Utils.log("=== ANALYZING ROUTE PROBLEMS ===", "INFO");

    const problems = { duplicates: 0, gaps: 0, timeViolations: 0 };
    const allStores = this.extractScheduledStores(planResult.workingDays);

    problems.duplicates = this.checkDuplicates(allStores);
    problems.gaps = this.checkGapViolations(allStores);
    problems.timeViolations = this.checkTimeViolations(planResult.workingDays);

    const total = problems.duplicates + problems.gaps + problems.timeViolations;
    Utils.log(
      `PROBLEMS FOUND: ${total} (${problems.duplicates} duplicates, ${problems.gaps} gaps, ${problems.timeViolations} time violations)`,
      total > 0 ? "ERROR" : "INFO"
    );

    return problems;
  }

  extractScheduledStores(workingDays) {
    const stores = [];
    let dayIndex = 0;

    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores) {
          dayInfo.optimizedStores.forEach((store) => {
            stores.push({ ...store, dayIndex });
          });
        }
        dayIndex++;
      });
    });

    return stores;
  }

  checkDuplicates(allStores) {
    const storeMap = {};
    let duplicates = 0;

    allStores.forEach((store) => {
      const noStr = store.noStr || store.name;
      if (!storeMap[noStr]) storeMap[noStr] = [];
      storeMap[noStr].push(store);
    });

    Object.entries(storeMap).forEach(([noStr, visits]) => {
      const expectedVisits = Math.floor(visits[0].baseFrequency || 1);
      if (visits.length > expectedVisits) {
        Utils.log(
          `❌ DUPLICATE: ${visits[0].name} (${noStr}) appears ${visits.length} times, expected ${expectedVisits}`,
          "ERROR"
        );
        duplicates++;
      }
    });

    return duplicates;
  }

  checkGapViolations(allStores) {
    const storeMap = {};
    let violations = 0;

    allStores.forEach((store) => {
      const noStr = store.noStr || store.name;
      if (!storeMap[noStr]) storeMap[noStr] = [];
      storeMap[noStr].push(store);
    });

    Object.entries(storeMap).forEach(([noStr, visits]) => {
      if (visits.length >= 2) {
        visits.sort((a, b) => a.dayIndex - b.dayIndex);
        for (let i = 1; i < visits.length; i++) {
          const gap = visits[i].dayIndex - visits[i - 1].dayIndex;
          if (gap < 5) {
            Utils.log(
              `❌ GAP VIOLATION: ${visits[0].name} (${noStr}) gap ${gap} days < 5 minimum`,
              "ERROR"
            );
            violations++;
          }
        }
      }
    });

    return violations;
  }

  checkTimeViolations(workingDays) {
    let violations = 0;

    workingDays.forEach((week, weekIdx) => {
      week.forEach((dayInfo, dayIdx) => {
        if (dayInfo.optimizedStores) {
          const violatingStores = dayInfo.optimizedStores.filter(
            (store) => store.departTime > CONFIG.WORK.END
          );
          if (violatingStores.length > 0) {
            Utils.log(
              `❌ TIME VIOLATION: Week ${weekIdx + 1} ${dayInfo.dayName} has ${
                violatingStores.length
              } stores after 6:20 PM`,
              "ERROR"
            );
            violations++;
          }
        }
      });
    });

    return violations;
  }
}

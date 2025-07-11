// ==================== SIMPLE GEOGRAPHIC ROUTE OPTIMIZER ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
  }

  // STEP 1: Create visit instances
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

    Utils.log(`Created ${instances.length} visit instances`, "INFO");
    return instances;
  }

  // STEP 2: Geographic sort - North to South, West to East
  geographicSort(stores) {
    Utils.log("Sorting stores geographically...", "INFO");

    const sorted = stores.sort((a, b) => {
      // Primary: Latitude (North to South)
      const latDiff = b.lat - a.lat;
      if (Math.abs(latDiff) > 0.005) {
        // ~500m threshold
        return latDiff;
      }
      // Secondary: Longitude (West to East)
      return a.lng - b.lng;
    });

    Utils.log(`Sorted ${sorted.length} stores geographically`, "INFO");
    return sorted;
  }

  // STEP 3: Distribute stores to days sequentially
  distributeStores(sortedStores) {
    Utils.log("Distributing stores to days...", "INFO");

    const storesPerDay = 13; // Target stores per day
    let storeIndex = 0;

    // Clear all existing stores
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        day.stores = [];
      });
    });

    // Distribute stores sequentially
    this.workingDays.forEach((week, weekIdx) => {
      week.forEach((day, dayIdx) => {
        const dayStores = [];

        // Add stores to this day
        for (
          let i = 0;
          i < storesPerDay && storeIndex < sortedStores.length;
          i++
        ) {
          dayStores.push(sortedStores[storeIndex]);
          storeIndex++;
        }

        day.stores = dayStores;

        if (dayStores.length > 0) {
          Utils.log(
            `Week ${weekIdx + 1}, ${day.dayName}: ${dayStores.length} stores`,
            "INFO"
          );
        }
      });
    });

    const unassigned = sortedStores.slice(storeIndex);
    Utils.log(
      `Distribution complete: ${storeIndex} assigned, ${unassigned.length} unassigned`,
      "INFO"
    );

    return unassigned;
  }

  // STEP 4: Handle multi-visit gaps (simplified)
  handleMultiVisitGaps() {
    Utils.log("Handling multi-visit store gaps...", "INFO");

    // Find multi-visit stores
    const multiVisitStores = {};

    this.workingDays.forEach((week, weekIdx) => {
      week.forEach((day, dayIdx) => {
        day.stores.forEach((store) => {
          if (store.isMultiVisit) {
            const storeId = store.storeId || store.name;
            if (!multiVisitStores[storeId]) {
              multiVisitStores[storeId] = [];
            }
            multiVisitStores[storeId].push({
              store: store,
              weekIdx: weekIdx,
              dayIdx: dayIdx,
              day: day,
            });
          }
        });
      });
    });

    // For stores with multiple visits, ensure 14-day gaps
    Object.entries(multiVisitStores).forEach(([storeId, visits]) => {
      if (visits.length > 1) {
        // Remove extra visits and redistribute
        for (let i = 1; i < visits.length; i++) {
          const visit = visits[i];
          // Remove from current day
          const storeIndex = visit.day.stores.findIndex(
            (s) =>
              (s.visitId || s.name) ===
              (visit.store.visitId || visit.store.name)
          );
          if (storeIndex > -1) {
            visit.day.stores.splice(storeIndex, 1);
          }

          // Find a day at least 14 days later
          const targetWeek = Math.min(4, visit.weekIdx + 2); // 2 weeks later
          if (targetWeek < this.workingDays.length) {
            const targetDay = this.workingDays[targetWeek][0]; // Monday of target week
            targetDay.stores.push(visit.store);
            Utils.log(
              `Moved ${storeId} visit ${i + 1} to Week ${targetWeek + 1}`,
              "INFO"
            );
          }
        }
      }
    });
  }

  // STEP 5: Optimize routes within each day
  optimizeDayRoute(stores, dayInfo) {
    if (!stores.length) return [];

    // Simple nearest neighbor optimization
    const orderedStores = this.nearestNeighborSort(stores);

    // Calculate timing
    return this.calculateTiming(orderedStores, dayInfo);
  }

  // Simple nearest neighbor sorting
  nearestNeighborSort(stores) {
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

  // Calculate timing for route
  calculateTiming(stores, dayInfo) {
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
        travelTime = Math.round(distance * 3); // 3 min per km

        // Handle break
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

      // Skip if exceeds work hours
      if (departTime > CONFIG.WORK.END) {
        continue;
      }

      route.push({
        ...store,
        order: route.length + 1,
        distance,
        duration: travelTime,
        arrivalTime,
        departTime,
        dayInfo: dayInfo,
      });

      currentLat = store.lat;
      currentLng = store.lng;
      currentTime = departTime;
    }

    return route;
  }

  // MAIN: Simple optimize plan
  optimizePlan(stores) {
    Utils.log("=== SIMPLE GEOGRAPHIC OPTIMIZATION STARTED ===", "INFO");

    // Step 1: Create visit instances
    const allVisitInstances = this.createVisitInstances(stores);

    // Step 2: Geographic sort
    const sortedStores = this.geographicSort(allVisitInstances);

    // Step 3: Distribute to days
    const unassignedStores = this.distributeStores(sortedStores);

    // Step 4: Handle multi-visit gaps
    this.handleMultiVisitGaps();

    // Step 5: Optimize routes
    this.workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        const optimizedRoute = this.optimizeDayRoute(dayInfo.stores, dayInfo);
        dayInfo.optimizedStores = optimizedRoute;
      });
    });

    Utils.log("=== SIMPLE GEOGRAPHIC OPTIMIZATION COMPLETED ===", "INFO");

    // Log results
    this.logResults();

    return {
      workingDays: this.workingDays,
      unvisitedStores: unassignedStores,
      statistics: this.calculateStatistics(allVisitInstances),
      p1VisitFrequency: this.getAverageFrequency(stores, "P1"),
      hasW5: this.workingDays.length === 5,
    };
  }

  // Log results
  logResults() {
    let totalStores = 0;
    let activeDays = 0;

    this.workingDays.forEach((week, weekIdx) => {
      week.forEach((day, dayIdx) => {
        const storeCount = day.optimizedStores ? day.optimizedStores.length : 0;
        if (storeCount > 0) {
          totalStores += storeCount;
          activeDays++;
          Utils.log(
            `Week ${weekIdx + 1}, ${day.dayName}: ${storeCount} stores`,
            "INFO"
          );
        }
      });
    });

    const avgStores =
      activeDays > 0 ? (totalStores / activeDays).toFixed(1) : 0;
    Utils.log(
      `RESULTS: ${totalStores} total stores, ${avgStores} avg/day, ${activeDays} active days`,
      "INFO"
    );
  }

  // Get average frequency
  getAverageFrequency(stores, priority) {
    const priorityStores = stores.filter((s) => s.priority === priority);
    if (priorityStores.length === 0) return 0;

    return (
      priorityStores.reduce((sum, s) => sum + (s.baseFrequency || 0), 0) /
      priorityStores.length
    );
  }

  // Calculate statistics
  calculateStatistics(allVisitInstances) {
    let totalVisitsPlanned = 0;
    let totalDistance = 0;
    let multiVisitStores = 0;
    const storeVisitCounts = {};
    const retailerCounts = {};
    const dailyStats = [];

    this.workingDays.forEach((week, weekIdx) => {
      week.forEach((day, dayIdx) => {
        if (day.optimizedStores && day.optimizedStores.length > 0) {
          const dayStores = day.optimizedStores.length;
          const dayDistance = day.optimizedStores.reduce(
            (sum, s) => sum + (s.distance || 0),
            0
          );

          dailyStats.push({
            week: weekIdx + 1,
            day: day.dayName,
            stores: dayStores,
            distance: dayDistance.toFixed(1),
          });

          day.optimizedStores.forEach((store) => {
            totalVisitsPlanned++;
            totalDistance += store.distance || 0;

            const storeId = store.storeId || store.name;
            storeVisitCounts[storeId] = (storeVisitCounts[storeId] || 0) + 1;

            const retailer = store.retailer || "Unknown";
            retailerCounts[retailer] = (retailerCounts[retailer] || 0) + 1;
          });
        }
      });
    });

    Object.values(storeVisitCounts).forEach((visitCount) => {
      if (visitCount > 1) multiVisitStores++;
    });

    const unvisitedCount = allVisitInstances.length - totalVisitsPlanned;
    const workingDaysUsed = dailyStats.length;
    const avgStoresPerDay =
      workingDaysUsed > 0
        ? (totalVisitsPlanned / workingDaysUsed).toFixed(1)
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
      coveragePercentage:
        allVisitInstances.length > 0
          ? ((totalVisitsPlanned / allVisitInstances.length) * 100).toFixed(1)
          : 0,
      retailerCounts: retailerCounts,

      // Simple optimization stats
      simpleOptimization: {
        algorithm: "Simple Geographic (North→South, West→East)",
        totalDays: this.workingDays.flat().length,
        dailyBreakdown: dailyStats,
      },
    };
  }
}

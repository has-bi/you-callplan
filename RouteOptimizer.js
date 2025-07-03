// ==================== ENHANCED ROUTE OPTIMIZER ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
  }

  createVisitInstances(stores) {
    const instances = [];
    stores.forEach((store) => {
      if (store.actualVisits > 0) {
        for (let v = 0; v < store.actualVisits; v++) {
          instances.push({
            ...store,
            visitNum: v + 1,
            visitId: `${store.name}_${v + 1}`,
            storeId: store.name, // NEW: Track which store this visit belongs to
            isMultiVisit: store.actualVisits > 1, // NEW: Flag for multi-visit stores
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

  // NEW: Enhanced P1 distribution with proper visit separation
  distributeP1Visits(allVisitInstances, hasW5 = false) {
    const p1Visits = allVisitInstances.filter(
      (visit) => visit.priority === "P1"
    );

    if (p1Visits.length === 0) return;

    // Group visits by store
    const visitsByStore = {};
    p1Visits.forEach((visit) => {
      if (!visitsByStore[visit.storeId]) {
        visitsByStore[visit.storeId] = [];
      }
      visitsByStore[visit.storeId].push(visit);
    });

    // Separate single-visit and multi-visit stores
    const singleVisitStores = [];
    const multiVisitStores = [];

    Object.entries(visitsByStore).forEach(([storeId, visits]) => {
      if (visits.length === 1) {
        singleVisitStores.push(visits[0]);
      } else {
        multiVisitStores.push({
          storeId,
          visits: visits.sort((a, b) => a.visitNum - b.visitNum),
          visitCount: visits.length,
        });
      }
    });

    Utils.log(
      `P1 Distribution: ${singleVisitStores.length} single-visit, ${multiVisitStores.length} multi-visit stores`,
      "INFO"
    );

    // Step 1: Distribute multi-visit stores first (they have constraints)
    this.distributeMultiVisitStores(multiVisitStores, hasW5);

    // Step 2: Distribute single-visit stores
    this.distributeSingleVisitStores(singleVisitStores);
  }

  // NEW: Handle multi-visit stores with proper separation
  distributeMultiVisitStores(multiVisitStores, hasW5) {
    const availableWeeks = hasW5 ? 5 : 4;

    multiVisitStores.forEach((storeGroup) => {
      const { visits, visitCount } = storeGroup;

      if (visitCount === 2) {
        // For 2 visits: distribute across weeks with maximum separation
        const selectedWeeks =
          this.selectOptimalWeeksForTwoVisits(availableWeeks);

        visits.forEach((visit, index) => {
          const targetWeek = selectedWeeks[index];
          const weekDays = this.workingDays[targetWeek];

          // Find day with least stores, considering geographic proximity
          const targetDay = this.findOptimalDayInWeek(weekDays, visit);

          if (targetDay) {
            targetDay.stores.push(visit);
            Utils.log(
              `Scheduled ${visit.storeId} visit ${visit.visitNum} to Week ${
                targetWeek + 1
              }, ${targetDay.dayName}`,
              "INFO"
            );
          }
        });
      } else if (visitCount >= 3) {
        // For 3+ visits: spread across different weeks
        const weekAssignments = this.distributeVisitsAcrossWeeks(
          visitCount,
          availableWeeks
        );

        visits.forEach((visit, index) => {
          const targetWeek = weekAssignments[index];
          const weekDays = this.workingDays[targetWeek];
          const targetDay = this.findOptimalDayInWeek(weekDays, visit);

          if (targetDay) {
            targetDay.stores.push(visit);
          }
        });
      }
    });
  }

  // NEW: Select optimal weeks for 2-visit stores
  selectOptimalWeeksForTwoVisits(availableWeeks) {
    if (availableWeeks >= 4) {
      // Prefer Week 1 and Week 3 (or Week 1 and Week 4)
      return [0, 2]; // Week 1 and Week 3
    } else if (availableWeeks === 3) {
      return [0, 2]; // Week 1 and Week 3
    } else {
      return [0, 1]; // Week 1 and Week 2 (fallback)
    }
  }

  // NEW: Distribute visits across weeks for 3+ visits
  distributeVisitsAcrossWeeks(visitCount, availableWeeks) {
    const assignments = [];

    if (visitCount === 3 && availableWeeks >= 4) {
      // For 3 visits in 4+ weeks: Week 1, 2, 4 (skip week 3)
      assignments.push(0, 1, 3);
    } else if (visitCount === 4 && availableWeeks >= 4) {
      // For 4 visits: one per week
      assignments.push(0, 1, 2, 3);
    } else if (visitCount === 5 && availableWeeks === 5) {
      // For 5 visits: one per week
      assignments.push(0, 1, 2, 3, 4);
    } else {
      // Fallback: distribute as evenly as possible
      for (let i = 0; i < visitCount; i++) {
        const weekIndex = Math.floor((i * availableWeeks) / visitCount);
        assignments.push(Math.min(weekIndex, availableWeeks - 1));
      }
    }

    return assignments.slice(0, visitCount);
  }

  // NEW: Find optimal day within a week for a visit
  findOptimalDayInWeek(weekDays, visit) {
    // Calculate current load and geographic fit for each day
    const dayScores = weekDays.map((day) => {
      const currentStores = day.stores.length;
      const capacity = CONFIG.CLUSTERING.MAX_STORES_PER_DAY - currentStores;

      if (capacity <= 0) return { day, score: -1 }; // No capacity

      // Calculate geographic score (prefer days with nearby stores)
      let geoScore = 0;
      if (day.stores.length > 0) {
        const distances = day.stores.map((store) =>
          Utils.distance(visit.lat, visit.lng, store.lat, store.lng)
        );
        const avgDistance =
          distances.reduce((sum, d) => sum + d, 0) / distances.length;
        geoScore = Math.max(0, 50 - avgDistance); // Higher score for closer stores
      }

      // Combined score: prefer days with capacity and geographic fit
      const score = capacity * 10 + geoScore;

      return { day, score, currentStores, capacity };
    });

    // Sort by score (highest first)
    dayScores.sort((a, b) => b.score - a.score);

    Utils.log(
      `Day selection for ${visit.storeId}: scores = ${dayScores
        .map((ds) => `${ds.day.dayName}:${ds.score.toFixed(1)}`)
        .join(", ")}`,
      "INFO"
    );

    return dayScores[0].score > 0 ? dayScores[0].day : null;
  }

  // NEW: Distribute single-visit stores
  distributeSingleVisitStores(singleVisitStores) {
    // Create geographic clusters for single visits
    const clusters = this.createGeographicClusters(singleVisitStores);

    clusters.forEach((cluster) => {
      // Find the week/day combination with best fit
      let bestDay = null;
      let bestScore = -1;

      this.workingDays.forEach((week, weekIndex) => {
        week.forEach((day) => {
          const capacity =
            CONFIG.CLUSTERING.MAX_STORES_PER_DAY - day.stores.length;

          if (capacity >= cluster.length) {
            // Calculate geographic compatibility with existing stores
            let geoScore = 0;
            if (day.stores.length > 0) {
              const centerLat =
                cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length;
              const centerLng =
                cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length;

              const distances = day.stores.map((store) =>
                Utils.distance(centerLat, centerLng, store.lat, store.lng)
              );
              const avgDistance =
                distances.reduce((sum, d) => sum + d, 0) / distances.length;
              geoScore = Math.max(0, 30 - avgDistance);
            }

            const score = capacity * 5 + geoScore + (4 - weekIndex); // Slight preference for earlier weeks

            if (score > bestScore) {
              bestScore = score;
              bestDay = day;
            }
          }
        });
      });

      if (bestDay) {
        bestDay.stores.push(...cluster);
        Utils.log(
          `Scheduled cluster of ${cluster.length} single-visit P1 stores to ${bestDay.dayName}`,
          "INFO"
        );
      } else {
        Utils.log(
          `Could not schedule cluster of ${cluster.length} P1 stores - no capacity`,
          "WARN"
        );
      }
    });
  }

  // Modified main optimization method
  optimizePlan(stores) {
    const allVisitInstances = this.createVisitInstances(stores);

    const p1Stores = stores.filter((s) => s.priority === "P1");
    const p1VisitFrequency =
      p1Stores.length > 0 ? p1Stores[0].baseFrequency || 0 : 0;

    const hasW5 = this.workingDays.length === 5;

    // NEW: Enhanced P1 distribution with proper visit separation
    this.distributeP1Visits(allVisitInstances, hasW5);

    // Process other priority visits (unchanged)
    const otherVisits = allVisitInstances.filter((v) => v.priority !== "P1");
    const otherClusters = this.createGeographicClusters(otherVisits);

    // Sort other clusters by priority and size
    otherClusters.sort((a, b) => {
      const avgPriorityA =
        a.reduce((sum, s) => sum + s.priorityNum, 0) / a.length;
      const avgPriorityB =
        b.reduce((sum, s) => sum + s.priorityNum, 0) / b.length;

      if (avgPriorityA !== avgPriorityB) {
        return avgPriorityA - avgPriorityB;
      }

      return b.length - a.length;
    });

    // Assign other clusters to available days
    otherClusters.forEach((cluster) => {
      let targetDay = null;
      let maxCapacity = 0;
      let bestScore = -1;

      this.workingDays.forEach((week) => {
        week.forEach((day) => {
          const availableCapacity =
            CONFIG.CLUSTERING.MAX_STORES_PER_DAY - day.stores.length;

          if (availableCapacity >= cluster.length) {
            const currentP1Count = day.stores.filter(
              (s) => s.priority === "P1"
            ).length;
            const clusterP1Count = cluster.filter(
              (s) => s.priority === "P1"
            ).length;
            const clusterAvgPriority =
              cluster.reduce((sum, s) => sum + s.priorityNum, 0) /
              cluster.length;

            let score = availableCapacity;

            if (clusterP1Count > 0) {
              score += (10 - currentP1Count) * 2;
            }

            score += (10 - clusterAvgPriority) * 1.5;

            if (score > bestScore) {
              bestScore = score;
              maxCapacity = availableCapacity;
              targetDay = day;
            }
          }
        });
      });

      if (targetDay) {
        targetDay.stores.push(...cluster);
      }
    });

    // Time utilization optimization (unchanged)
    this.optimizeTimeUtilization(allVisitInstances);

    // Convert to optimized routes
    this.workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        const optimizedRoute = this.optimizeDayRoute(dayInfo.stores, dayInfo);
        dayInfo.optimizedStores = optimizedRoute;
      });
    });

    return {
      workingDays: this.workingDays,
      unvisitedStores: this.getUnvisitedStores(allVisitInstances),
      statistics: this.calculateStatistics(allVisitInstances),
      p1VisitFrequency,
      hasW5: hasW5,
    };
  }

  // Existing methods remain the same...
  createGeographicClusters(stores) {
    if (!stores.length) return [];

    const clusters = [];
    const visited = new Set();

    const storesByDistrict = {};
    stores.forEach((store) => {
      const district = store.district || "Unknown";
      if (!storesByDistrict[district]) {
        storesByDistrict[district] = [];
      }
      storesByDistrict[district].push(store);
    });

    Object.entries(storesByDistrict).forEach(
      ([districtName, districtStores]) => {
        const maxClusterSize = Math.min(
          CONFIG.CLUSTERING.MAX_STORES_PER_DAY,
          Math.max(3, Math.ceil(districtStores.length / 3))
        );

        districtStores.forEach((store) => {
          const id = store.visitId || store.name;
          if (visited.has(id)) return;

          const cluster = [store];
          visited.add(id);

          const nearbyStores = [];
          districtStores.forEach((other) => {
            const otherId = other.visitId || other.name;
            if (visited.has(otherId)) return;

            const distance = Utils.distance(
              store.lat,
              store.lng,
              other.lat,
              other.lng
            );
            if (distance <= CONFIG.CLUSTERING.MAX_RADIUS) {
              nearbyStores.push({ store: other, distance });
            }
          });

          nearbyStores
            .sort((a, b) => a.distance - b.distance)
            .forEach((item) => {
              if (cluster.length < maxClusterSize) {
                cluster.push(item.store);
                visited.add(item.store.visitId || item.store.name);
              }
            });

          clusters.push(cluster);
        });
      }
    );

    return clusters;
  }

  optimizeStoreOrder(stores) {
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

  optimizeDayRoute(stores, dayInfo) {
    if (!stores.length) return [];

    const orderedStores = this.optimizeStoreOrder(stores);
    const route = [];
    let currentTime = CONFIG.WORK.START;
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;
    let hasBreak = false;

    const breakConfig = dayInfo.isFriday ? CONFIG.FRIDAY_PRAYER : CONFIG.LUNCH;

    for (const [index, store] of orderedStores.entries()) {
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
        travelTime = Math.round(distance * 3);

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

  // Rest of the methods remain unchanged...
  optimizeTimeUtilization(allVisitInstances) {
    // Keep existing implementation
  }

  getUnvisitedStores(allVisitInstances) {
    const visitedIds = new Set();
    this.workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores) {
          dayInfo.optimizedStores.forEach((store) => {
            visitedIds.add(store.visitId || store.name);
          });
        }
      });
    });
    return allVisitInstances.filter(
      (v) => !visitedIds.has(v.visitId || v.name)
    );
  }

  calculateStatistics(allVisitInstances) {
    // Keep existing implementation with multi-visit tracking
    let totalVisitsPlanned = 0;
    let totalDistance = 0;
    let multiVisitStores = 0;

    const storeVisitCounts = {};

    this.workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
          dayInfo.optimizedStores.forEach((store) => {
            totalVisitsPlanned++;
            totalDistance += store.distance || 0;

            // Track visits per store
            const storeId = store.storeId || store.name;
            storeVisitCounts[storeId] = (storeVisitCounts[storeId] || 0) + 1;
          });
        }
      });
    });

    // Count stores with multiple visits
    Object.values(storeVisitCounts).forEach((visitCount) => {
      if (visitCount > 1) multiVisitStores++;
    });

    const unvisitedCount = this.getUnvisitedStores(allVisitInstances).length;

    return {
      totalStoresPlanned: totalVisitsPlanned,
      totalStoresRequired: allVisitInstances.length,
      uniqueStoresVisited: Object.keys(storeVisitCounts).length,
      multiVisitStores: multiVisitStores,
      unvisitedCount,
      totalDistance,
      averageStoresPerDay:
        this.workingDays.length > 0
          ? (totalVisitsPlanned / this.workingDays.flat().length).toFixed(1)
          : 0,
      coveragePercentage:
        allVisitInstances.length > 0
          ? ((totalVisitsPlanned / allVisitInstances.length) * 100).toFixed(1)
          : 0,
    };
  }
}

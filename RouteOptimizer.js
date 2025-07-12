// ==================== GEOGRAPHIC-FIRST ROUTE OPTIMIZER ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
    this.flatDays = this.flattenWorkingDays();
    this.spatialIndex = null;
  }

  // ==================== MAIN OPTIMIZATION FLOW ====================

  optimizePlan(stores) {
    Utils.log("=== STARTING GEOGRAPHIC-FIRST OPTIMIZATION ===", "INFO");

    // Step 1: Create spatial index for efficient lookups
    this.spatialIndex = this.createSpatialIndex(stores);

    // Step 2: Filter stores by distance limit
    const validStores = this.filterByDistanceLimit(stores);

    // Step 3: Create visit instances (handle multi-visit stores)
    const visitInstances = this.createVisitInstances(validStores);

    // Step 4: Perform k-means clustering
    const optimalK = this.calculateOptimalClusters(visitInstances.length);
    const clusters = this.performKMeansClustering(visitInstances, optimalK);

    // Step 5: Assign clusters to days with load balancing
    const dayAssignments = this.assignClustersTodays(clusters);

    // Step 6: Optimize routes within each day
    this.optimizeDailyRoutes(dayAssignments);

    // Step 7: Handle multi-visit constraints
    this.enforceMultiVisitConstraints(dayAssignments);

    // Step 8: Convert to output format
    return this.convertToOutputFormat(dayAssignments, stores, visitInstances);
  }

  // ==================== SPATIAL INDEXING ====================

  createSpatialIndex(stores, gridSize = 0.01) {
    const index = {};

    stores.forEach((store, idx) => {
      const gridX = Math.floor(store.lat / gridSize);
      const gridY = Math.floor(store.lng / gridSize);
      const key = `${gridX},${gridY}`;

      if (!index[key]) {
        index[key] = [];
      }
      index[key].push({ ...store, originalIndex: idx });
    });

    return {
      index: index,
      gridSize: gridSize,

      getNearbyStores(lat, lng, radius = 5) {
        const results = [];
        const gridRadius = Math.ceil(radius / (gridSize * 111));

        const centerX = Math.floor(lat / gridSize);
        const centerY = Math.floor(lng / gridSize);

        for (let dx = -gridRadius; dx <= gridRadius; dx++) {
          for (let dy = -gridRadius; dy <= gridRadius; dy++) {
            const key = `${centerX + dx},${centerY + dy}`;
            if (index[key]) {
              index[key].forEach((store) => {
                const dist = Utils.distance(lat, lng, store.lat, store.lng);
                if (dist <= radius) {
                  results.push({ store, distance: dist });
                }
              });
            }
          }
        }

        return results.sort((a, b) => a.distance - b.distance);
      },
    };
  }

  // ==================== DISTANCE FILTERING ====================

  filterByDistanceLimit(stores) {
    const maxDistance = CONFIG.TRAVEL_LIMITS?.MAX_DISTANCE_FROM_HOME || 40;
    const validStores = [];

    stores.forEach((store) => {
      const distanceFromHome = Utils.distance(
        CONFIG.START.LAT,
        CONFIG.START.LNG,
        store.lat,
        store.lng
      );

      if (distanceFromHome <= maxDistance) {
        validStores.push({
          ...store,
          distanceFromHome: distanceFromHome,
        });
      } else {
        Utils.log(
          `Excluding ${store.name}: ${distanceFromHome.toFixed(
            1
          )}km > ${maxDistance}km limit`,
          "INFO"
        );
      }
    });

    Utils.log(
      `Distance filter: ${validStores.length}/${stores.length} stores within ${maxDistance}km`,
      "INFO"
    );
    return validStores;
  }

  // ==================== VISIT INSTANCE CREATION ====================

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
            demand: 1,
            serviceTime: store.visitTime || CONFIG.DEFAULT_VISIT_TIME,
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

  // ==================== K-MEANS CLUSTERING ====================

  calculateOptimalClusters(storeCount) {
    const avgStoresPerDay =
      CONFIG.CLUSTERING.MIN_STORES_PER_DAY +
      (CONFIG.CLUSTERING.MAX_STORES_PER_DAY -
        CONFIG.CLUSTERING.MIN_STORES_PER_DAY) /
        2;
    const workingDays = this.flatDays.length;

    // Calculate optimal k based on store count and working days
    const k = Math.min(Math.ceil(storeCount / avgStoresPerDay), workingDays);

    Utils.log(
      `Optimal clusters: ${k} (${storeCount} stores, ${avgStoresPerDay} avg/day)`,
      "INFO"
    );
    return k;
  }

  performKMeansClustering(stores, k) {
    if (stores.length <= k) {
      return stores.map((store) => [store]);
    }

    // Initialize centroids using k-means++
    const centroids = this.initializeCentroidsKMeansPlusPlus(stores, k);

    let clusters = [];
    let iterations = 0;
    const maxIterations = 50;
    let previousCost = Infinity;

    while (iterations < maxIterations) {
      // Assign stores to nearest centroid
      clusters = Array(k)
        .fill(null)
        .map(() => []);
      let totalCost = 0;

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
        totalCost += minDist;
      });

      // Check for convergence
      if (Math.abs(previousCost - totalCost) < 0.001) {
        Utils.log(`K-means converged after ${iterations} iterations`, "INFO");
        break;
      }
      previousCost = totalCost;

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

    // Remove empty clusters and apply size constraints
    const validClusters = this.applyClusterConstraints(
      clusters.filter((c) => c.length > 0)
    );

    Utils.log(
      `K-means completed: ${validClusters.length} clusters from ${k} initial`,
      "INFO"
    );
    return validClusters;
  }

  initializeCentroidsKMeansPlusPlus(stores, k) {
    const centroids = [];
    const storesCopy = [...stores];

    // First centroid: random store
    const firstIdx = Math.floor(Math.random() * storesCopy.length);
    centroids.push({
      lat: storesCopy[firstIdx].lat,
      lng: storesCopy[firstIdx].lng,
    });

    // Remaining centroids: probability based on squared distance
    for (let i = 1; i < k; i++) {
      const distances = storesCopy.map((store) => {
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

      for (let j = 0; j < storesCopy.length; j++) {
        random -= distances[j];
        if (random <= 0) {
          centroids.push({
            lat: storesCopy[j].lat,
            lng: storesCopy[j].lng,
          });
          break;
        }
      }
    }

    return centroids;
  }

  applyClusterConstraints(clusters) {
    const maxSize = CONFIG.CLUSTERING.MAX_STORES_PER_DAY;
    const minSize = CONFIG.CLUSTERING.MIN_STORES_PER_DAY;
    const finalClusters = [];

    clusters.forEach((cluster) => {
      if (cluster.length <= maxSize) {
        finalClusters.push(cluster);
      } else {
        // Split large clusters
        const numSplits = Math.ceil(cluster.length / maxSize);
        const subClusters = this.performKMeansClustering(cluster, numSplits);
        finalClusters.push(...subClusters);
      }
    });

    // Merge very small clusters if possible
    const merged = this.mergeSmallClusters(finalClusters, minSize);

    return merged;
  }

  mergeSmallClusters(clusters, minSize) {
    const sorted = clusters.sort((a, b) => a.length - b.length);
    const merged = [];
    const used = new Set();

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;

      const cluster = sorted[i];
      if (cluster.length >= minSize) {
        merged.push(cluster);
        used.add(i);
      } else {
        // Try to merge with nearby small cluster
        let bestMerge = -1;
        let minDistance = Infinity;

        for (let j = i + 1; j < sorted.length; j++) {
          if (used.has(j)) continue;
          if (
            cluster.length + sorted[j].length >
            CONFIG.CLUSTERING.MAX_STORES_PER_DAY
          )
            continue;

          const dist = this.clusterDistance(cluster, sorted[j]);
          if (dist < minDistance) {
            minDistance = dist;
            bestMerge = j;
          }
        }

        if (bestMerge !== -1 && minDistance < 10) {
          // 10km threshold
          merged.push([...cluster, ...sorted[bestMerge]]);
          used.add(i);
          used.add(bestMerge);
        } else {
          merged.push(cluster);
          used.add(i);
        }
      }
    }

    return merged;
  }

  clusterDistance(cluster1, cluster2) {
    const center1 = this.getClusterCenter(cluster1);
    const center2 = this.getClusterCenter(cluster2);
    return Utils.distance(center1.lat, center1.lng, center2.lat, center2.lng);
  }

  getClusterCenter(cluster) {
    return {
      lat: cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length,
      lng: cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length,
    };
  }

  // ==================== CLUSTER TO DAY ASSIGNMENT ====================

  assignClustersTodays(clusters) {
    const dayAssignments = this.flatDays.map((day, idx) => ({
      dayIndex: idx,
      dayInfo: day,
      stores: [],
      clusters: [],
      totalDistance: 0,
      capacity: CONFIG.CLUSTERING.MAX_STORES_PER_DAY,
    }));

    // Sort clusters by cohesiveness (internal distance)
    const sortedClusters = clusters
      .map((cluster, idx) => {
        const cohesiveness = this.calculateClusterCohesiveness(cluster);
        return { cluster, cohesiveness, index: idx };
      })
      .sort((a, b) => a.cohesiveness - b.cohesiveness);

    // Assign clusters to days using best-fit approach
    sortedClusters.forEach(({ cluster }) => {
      let bestDay = -1;
      let bestScore = -Infinity;

      dayAssignments.forEach((day, idx) => {
        if (day.stores.length + cluster.length > day.capacity) return;

        const score = this.calculateAssignmentScore(day, cluster);
        if (score > bestScore) {
          bestScore = score;
          bestDay = idx;
        }
      });

      if (bestDay !== -1) {
        dayAssignments[bestDay].stores.push(...cluster);
        dayAssignments[bestDay].clusters.push(cluster);
      }
    });

    // Balance load if needed
    this.balanceLoad(dayAssignments);

    return dayAssignments;
  }

  calculateClusterCohesiveness(cluster) {
    if (cluster.length <= 1) return 0;

    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        totalDistance += Utils.distance(
          cluster[i].lat,
          cluster[i].lng,
          cluster[j].lat,
          cluster[j].lng
        );
        count++;
      }
    }

    return count > 0 ? totalDistance / count : 0;
  }

  calculateAssignmentScore(day, cluster) {
    // Prefer days with fewer stores
    const capacityScore =
      ((day.capacity - day.stores.length) / day.capacity) * 100;

    // Prefer geographic proximity if day has stores
    let proximityScore = 0;
    if (day.stores.length > 0) {
      const dayCenter = this.getClusterCenter(day.stores);
      const clusterCenter = this.getClusterCenter(cluster);
      const distance = Utils.distance(
        dayCenter.lat,
        dayCenter.lng,
        clusterCenter.lat,
        clusterCenter.lng
      );
      proximityScore = Math.max(0, 50 - distance);
    }

    return capacityScore + proximityScore;
  }

  balanceLoad(dayAssignments) {
    const avgStores =
      dayAssignments.reduce((sum, day) => sum + day.stores.length, 0) /
      dayAssignments.length;
    const tolerance = 2;

    // Find over and under loaded days
    const overloaded = dayAssignments.filter(
      (day) => day.stores.length > avgStores + tolerance
    );
    const underloaded = dayAssignments.filter(
      (day) => day.stores.length < avgStores - tolerance
    );

    overloaded.forEach((overDay) => {
      while (
        overDay.stores.length > avgStores + tolerance &&
        underloaded.length > 0
      ) {
        // Find best store to move
        let bestStore = null;
        let bestUnderDay = null;
        let bestScore = -Infinity;

        overDay.stores.forEach((store) => {
          underloaded.forEach((underDay) => {
            if (underDay.stores.length >= underDay.capacity) return;

            const score = this.calculateMoveScore(store, overDay, underDay);
            if (score > bestScore) {
              bestScore = score;
              bestStore = store;
              bestUnderDay = underDay;
            }
          });
        });

        if (bestStore && bestUnderDay) {
          // Move store
          const idx = overDay.stores.indexOf(bestStore);
          overDay.stores.splice(idx, 1);
          bestUnderDay.stores.push(bestStore);

          // Update underloaded list
          if (bestUnderDay.stores.length >= avgStores - tolerance) {
            underloaded.splice(underloaded.indexOf(bestUnderDay), 1);
          }
        } else {
          break;
        }
      }
    });
  }

  calculateMoveScore(store, fromDay, toDay) {
    const fromCenter = this.getClusterCenter(fromDay.stores);
    const toCenter =
      toDay.stores.length > 0
        ? this.getClusterCenter(toDay.stores)
        : CONFIG.START;

    const currentDist = Utils.distance(
      store.lat,
      store.lng,
      fromCenter.lat,
      fromCenter.lng
    );
    const newDist = Utils.distance(
      store.lat,
      store.lng,
      toCenter.lat,
      toCenter.lng
    );

    return currentDist - newDist; // Positive if move reduces distance
  }

  // ==================== ROUTE OPTIMIZATION ====================

  optimizeDailyRoutes(dayAssignments) {
    dayAssignments.forEach((day) => {
      if (day.stores.length <= 1) return;

      // Start with nearest neighbor
      const nnRoute = this.nearestNeighborRoute(day.stores);

      // Improve with 2-opt
      const optimizedRoute = this.optimize2Opt(nnRoute);

      // Apply mall clustering if enabled
      if (CONFIG.CLUSTERING.MALL_DETECTION.ENABLE_MALL_CLUSTERING) {
        day.stores = this.applyMallClustering(optimizedRoute);
      } else {
        day.stores = optimizedRoute;
      }

      // Calculate total distance
      day.totalDistance = this.calculateRouteDistance(day.stores);
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
          const newRoute = this.perform2OptSwap(currentRoute, i, j);

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

  perform2OptSwap(route, i, j) {
    return [
      ...route.slice(0, i),
      ...route.slice(i, j + 1).reverse(),
      ...route.slice(j + 1),
    ];
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

    // Return to depot
    totalDistance += Utils.distance(
      current.lat,
      current.lng,
      CONFIG.START.LAT,
      CONFIG.START.LNG
    );

    return totalDistance;
  }

  applyMallClustering(stores) {
    const mallClusters = this.detectMallClusters(stores);
    const reorderedStores = [];
    const processed = new Set();

    stores.forEach((store) => {
      if (processed.has(store.name)) return;

      const mallId = store.mallClusterId;
      if (mallId && mallClusters[mallId]) {
        // Add all stores from this mall cluster
        mallClusters[mallId].forEach((mallStore) => {
          if (!processed.has(mallStore.name)) {
            reorderedStores.push(mallStore);
            processed.add(mallStore.name);
          }
        });
      } else {
        reorderedStores.push(store);
        processed.add(store.name);
      }
    });

    return reorderedStores;
  }

  detectMallClusters(stores) {
    const threshold = CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD;
    const clusters = {};

    stores.forEach((store, i) => {
      stores.forEach((other, j) => {
        if (i >= j) return;

        const distance = Utils.distance(
          store.lat,
          store.lng,
          other.lat,
          other.lng
        );
        if (distance <= threshold) {
          const clusterId =
            store.mallClusterId || other.mallClusterId || `MALL_${i}_${j}`;

          if (!clusters[clusterId]) {
            clusters[clusterId] = [];
          }

          store.mallClusterId = clusterId;
          other.mallClusterId = clusterId;

          if (!clusters[clusterId].includes(store))
            clusters[clusterId].push(store);
          if (!clusters[clusterId].includes(other))
            clusters[clusterId].push(other);
        }
      });
    });

    // Validate cluster sizes
    Object.entries(clusters).forEach(([id, cluster]) => {
      if (
        cluster.length > CONFIG.CLUSTERING.MALL_DETECTION.MAX_STORES_PER_MALL
      ) {
        // Split oversized clusters
        cluster.forEach((store, idx) => {
          if (idx >= CONFIG.CLUSTERING.MALL_DETECTION.MAX_STORES_PER_MALL) {
            delete store.mallClusterId;
          }
        });
      }
    });

    return clusters;
  }

  // ==================== MULTI-VISIT CONSTRAINTS ====================

  enforceMultiVisitConstraints(dayAssignments) {
    const multiVisitStores = {};

    // Collect all multi-visit stores
    dayAssignments.forEach((day, dayIdx) => {
      day.stores.forEach((store) => {
        if (store.isMultiVisit) {
          const storeId = store.storeId || store.name;
          if (!multiVisitStores[storeId]) {
            multiVisitStores[storeId] = [];
          }
          multiVisitStores[storeId].push({ store, dayIdx });
        }
      });
    });

    // Check and fix violations
    Object.entries(multiVisitStores).forEach(([storeId, visits]) => {
      if (visits.length < 2) return;

      visits.sort((a, b) => a.dayIdx - b.dayIdx);

      for (let i = 1; i < visits.length; i++) {
        const gap = visits[i].dayIdx - visits[i - 1].dayIdx;

        if (gap < 14) {
          // Need to reschedule
          const violatingVisit = visits[i];
          const targetDay = Math.min(
            visits[i - 1].dayIdx + 14,
            dayAssignments.length - 1
          );

          // Remove from current day
          const currentDay = dayAssignments[violatingVisit.dayIdx];
          const storeIdx = currentDay.stores.indexOf(violatingVisit.store);
          if (storeIdx !== -1) {
            currentDay.stores.splice(storeIdx, 1);
          }

          // Add to target day if possible
          if (
            targetDay < dayAssignments.length &&
            dayAssignments[targetDay].stores.length <
              dayAssignments[targetDay].capacity
          ) {
            dayAssignments[targetDay].stores.push(violatingVisit.store);
            violatingVisit.dayIdx = targetDay;

            Utils.log(
              `Rescheduled ${storeId} visit ${violatingVisit.store.visitNum} from day ${violatingVisit.dayIdx} to ${targetDay}`,
              "INFO"
            );
          }
        }
      }
    });
  }

  // ==================== OUTPUT FORMATTING ====================

  convertToOutputFormat(dayAssignments, originalStores, visitInstances) {
    // Map assignments back to working days structure
    let dayIndex = 0;
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        if (dayIndex < dayAssignments.length) {
          const assignment = dayAssignments[dayIndex];
          day.optimizedStores = this.createDetailedRoute(
            assignment.stores,
            day
          );
          day.totalDistance = assignment.totalDistance;
        } else {
          day.optimizedStores = [];
          day.totalDistance = 0;
        }
        dayIndex++;
      });
    });

    // Calculate statistics
    const statistics = this.calculateStatistics(dayAssignments, visitInstances);

    // Find unvisited stores
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
      // Calculate travel time
      const distance = Utils.distance(
        currentLat,
        currentLng,
        store.lat,
        store.lng
      );
      const travelTime = Math.round(distance * 3); // 3 min/km

      currentTime += travelTime;

      // Handle break
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
      });

      currentTime = departTime;
      currentLat = store.lat;
      currentLng = store.lng;
    });

    return route;
  }

  calculateStatistics(dayAssignments, visitInstances) {
    const activeDays = dayAssignments.filter((day) => day.stores.length > 0);
    const totalStores = dayAssignments.reduce(
      (sum, day) => sum + day.stores.length,
      0
    );
    const totalDistance = dayAssignments.reduce(
      (sum, day) => sum + day.totalDistance,
      0
    );

    // Calculate geographic optimization metrics
    const storesPerDay = activeDays.map((day) => day.stores.length);
    const maxStores = Math.max(...storesPerDay, 0);
    const minStores = Math.min(...storesPerDay.filter((s) => s > 0), 0);
    const avgStores =
      activeDays.length > 0 ? totalStores / activeDays.length : 0;

    // Multi-visit compliance
    const multiVisitStats = this.calculateMultiVisitCompliance(dayAssignments);

    // Mall clustering statistics
    const mallStats = this.calculateMallStats(dayAssignments);

    return {
      totalStoresRequired: visitInstances.length,
      totalStoresPlanned: totalStores,
      coveragePercentage: ((totalStores / visitInstances.length) * 100).toFixed(
        1
      ),
      workingDays: activeDays.length,
      totalDistance: totalDistance,
      averageStoresPerDay: avgStores.toFixed(1),
      averageDistancePerDay: (activeDays.length > 0
        ? totalDistance / activeDays.length
        : 0
      ).toFixed(1),

      geographicOptimization: {
        algorithm: "K-means Clustering with 2-Opt",
        maxStoresPerDay: maxStores,
        minStoresPerDay: minStores || 0,
        emptyDays: this.flatDays.length - activeDays.length,
        totalDays: this.flatDays.length,
        balanceScore:
          minStores > 0 ? ((minStores / maxStores) * 100).toFixed(0) : "0",
        utilizationRate: (
          (activeDays.length / this.flatDays.length) *
          100
        ).toFixed(0),
      },

      multiVisitGaps: multiVisitStats,
      mallStats: mallStats,
    };
  }

  calculateMultiVisitCompliance(dayAssignments) {
    const multiVisitTracking = {};
    let totalGaps = 0;
    let validGaps = 0;

    dayAssignments.forEach((day, dayIdx) => {
      day.stores.forEach((store) => {
        if (store.isMultiVisit) {
          const storeId = store.storeId || store.name;
          if (!multiVisitTracking[storeId]) {
            multiVisitTracking[storeId] = [];
          }
          multiVisitTracking[storeId].push(dayIdx);
        }
      });
    });

    const totalMultiVisitStores = Object.keys(multiVisitTracking).length;

    Object.values(multiVisitTracking).forEach((visits) => {
      if (visits.length > 1) {
        visits.sort((a, b) => a - b);
        for (let i = 1; i < visits.length; i++) {
          const gap = visits[i] - visits[i - 1];
          totalGaps++;
          if (gap >= 14) {
            validGaps++;
          }
        }
      }
    });

    return {
      totalMultiVisitStores: totalMultiVisitStores,
      totalGaps: totalGaps,
      validGaps: validGaps,
      gapCompliance:
        totalGaps > 0 ? ((validGaps / totalGaps) * 100).toFixed(0) : "100",
    };
  }

  calculateMallStats(dayAssignments) {
    let totalMallClusters = 0;
    let storesInMalls = 0;
    let timeSavings = 0;
    const uniqueMalls = new Set();

    dayAssignments.forEach((day) => {
      const dayMalls = new Set();

      day.stores.forEach((store) => {
        if (store.mallClusterId) {
          uniqueMalls.add(store.mallClusterId);
          dayMalls.add(store.mallClusterId);
          storesInMalls++;
        }
      });

      // Calculate time savings from mall clustering
      dayMalls.forEach((mallId) => {
        const mallStores = day.stores.filter((s) => s.mallClusterId === mallId);
        if (mallStores.length > 1) {
          // Save ~10 minutes per additional store in same mall
          timeSavings += (mallStores.length - 1) * 10;
        }
      });
    });

    totalMallClusters = uniqueMalls.size;

    return {
      totalMallClusters: totalMallClusters,
      storesInMalls: storesInMalls,
      avgStoresPerMall:
        totalMallClusters > 0
          ? (storesInMalls / totalMallClusters).toFixed(1)
          : "0",
      clusteringEfficiency:
        storesInMalls > 0
          ? (
              (storesInMalls /
                dayAssignments.reduce((sum, d) => sum + d.stores.length, 0)) *
              100
            ).toFixed(0)
          : "0",
      timeSavings: timeSavings,
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
    this.workingDays.forEach((week, weekIdx) => {
      week.forEach((day, dayIdx) => {
        flat.push({
          ...day,
          weekIndex: weekIdx,
          dayIndex: dayIdx,
          globalIndex: flat.length,
        });
      });
    });
    return flat;
  }
}

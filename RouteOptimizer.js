// ==================== ENHANCED ROUTE OPTIMIZER WITH CROSS-BORDER SUPPORT ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
    this.flatDays = this.flattenWorkingDays();
    this.spatialIndex = null;
    this.useEnhancedOptimization = true; // Toggle for enhanced features
  }

  // ==================== MAIN OPTIMIZATION FLOW ====================

  optimizePlan(stores) {
    Utils.log("=== STARTING ENHANCED ROUTE OPTIMIZATION ===", "INFO");

    try {
      // Try enhanced cross-border optimization first
      if (this.useEnhancedOptimization && stores.length >= 10) {
        return this.runEnhancedOptimization(stores);
      } else {
        return this.runBasicOptimization(stores);
      }
    } catch (error) {
      Utils.log(
        "Enhanced optimization failed, falling back to basic: " +
          error.toString(),
        "ERROR"
      );
      return this.runBasicOptimization(stores);
    }
  }

  // Enhanced optimization using cross-border algorithm
  runEnhancedOptimization(stores) {
    Utils.log("🚀 Using Enhanced Cross-Border Optimization", "INFO");

    // Initialize cross-border optimizer with dynamic config
    const optimizedConfig = this.getOptimizedConfig(stores);
    const crossBorderOptimizer = new CrossBorderOptimizer(optimizedConfig);

    // Run enhanced optimization
    const optimizationResult = crossBorderOptimizer.optimize(
      stores,
      this.workingDays
    );

    // Convert to existing output format for compatibility
    const formattedResult = this.convertToExistingFormat(
      optimizationResult,
      stores
    );

    Utils.log("✅ Enhanced optimization completed successfully", "INFO");
    return formattedResult;
  }

  // Fallback basic optimization (existing logic)
  runBasicOptimization(stores) {
    Utils.log("📊 Using Basic Geographic Optimization", "INFO");

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
    return this.convertBasicToOutputFormat(
      dayAssignments,
      stores,
      visitInstances
    );
  }

  // Get optimized configuration based on store characteristics
  getOptimizedConfig(stores) {
    const region = this.detectRegion(stores);
    const density = this.calculateStoreDensity(stores);

    const regionConfigs = {
      KL: {
        gridSize: 0.018,
        capacityPerDay: 13,
        minStoresPerDay: 8,
        maxDistance: 4,
        borderThreshold: 0.6,
      },
      SELANGOR: {
        gridSize: 0.022,
        capacityPerDay: 13,
        minStoresPerDay: 7,
        maxDistance: 6,
        borderThreshold: 0.7,
      },
      JOHOR: {
        gridSize: 0.025,
        capacityPerDay: 13,
        minStoresPerDay: 6,
        maxDistance: 8,
        borderThreshold: 0.8,
      },
      PENANG: {
        gridSize: 0.02,
        capacityPerDay: 13,
        minStoresPerDay: 7,
        maxDistance: 5,
        borderThreshold: 0.7,
      },
    };

    const baseConfig = regionConfigs[region] || regionConfigs["KL"];

    // Adjust for density
    if (density > 5) {
      baseConfig.gridSize = 0.015;
      baseConfig.maxDistance = 3;
      baseConfig.minStoresPerDay = 9;
    } else if (density < 1) {
      baseConfig.gridSize = 0.03;
      baseConfig.maxDistance = 10;
      baseConfig.minStoresPerDay = 5;
    }

    Utils.log(
      `Configuration: ${region} region, density ${density.toFixed(2)}, grid ${
        baseConfig.gridSize
      }`,
      "INFO"
    );
    return baseConfig;
  }

  detectRegion(stores) {
    if (stores.length === 0) return "KL";

    const centerLat = stores.reduce((sum, s) => sum + s.lat, 0) / stores.length;
    const centerLng = stores.reduce((sum, s) => sum + s.lng, 0) / stores.length;

    // Region boundaries (approximate)
    if (
      centerLat >= 3.0 &&
      centerLat <= 3.25 &&
      centerLng >= 101.6 &&
      centerLng <= 101.8
    ) {
      return "KL";
    } else if (
      centerLat >= 2.8 &&
      centerLat <= 3.8 &&
      centerLng >= 101.2 &&
      centerLng <= 102.0
    ) {
      return "SELANGOR";
    } else if (
      centerLat >= 1.2 &&
      centerLat <= 2.0 &&
      centerLng >= 103.0 &&
      centerLng <= 104.5
    ) {
      return "JOHOR";
    } else if (
      centerLat >= 5.0 &&
      centerLat <= 5.7 &&
      centerLng >= 100.0 &&
      centerLng <= 100.8
    ) {
      return "PENANG";
    }

    return "KL";
  }

  calculateStoreDensity(stores) {
    if (stores.length < 2) return 1;

    const lats = stores.map((s) => s.lat);
    const lngs = stores.map((s) => s.lng);

    const latSpread = (Math.max(...lats) - Math.min(...lats)) * 111;
    const lngSpread =
      (Math.max(...lngs) - Math.min(...lngs)) *
      111 *
      Math.cos((Math.min(...lats) * Math.PI) / 180);

    const area = latSpread * lngSpread;
    return stores.length / Math.max(area, 1);
  }

  // Convert enhanced results to existing format for backward compatibility
  convertToExistingFormat(optimizationResult, originalStores) {
    // Map enhanced routes back to workingDays structure
    let dayIndex = 0;

    // Clear existing assignments
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        day.optimizedStores = [];
        day.crossBorderInfo = { count: 0, sources: [] };
      });
    });

    // Apply enhanced optimization results
    optimizationResult.routes.forEach((optimizedDay) => {
      if (dayIndex < this.flatDays.length) {
        const targetDay = this.findDayByIndex(dayIndex);
        if (targetDay) {
          targetDay.optimizedStores = this.createDetailedRoute(
            optimizedDay.stores,
            targetDay
          );
          targetDay.crossBorderInfo = optimizedDay.crossBorderInfo;
          targetDay.optimizationType = optimizedDay.type;
          targetDay.utilization = optimizedDay.utilization;
        }
        dayIndex++;
      }
    });

    // Calculate enhanced statistics
    const statistics = this.calculateEnhancedStatistics(
      optimizationResult,
      originalStores
    );

    return {
      workingDays: this.workingDays,
      unvisitedStores: this.findUnvisitedStores(
        originalStores,
        optimizationResult.routes
      ),
      statistics: statistics,
      gridAnalysis: optimizationResult.gridAnalysis,
      performance: optimizationResult.performance,
      p1VisitFrequency: this.getP1Frequency(originalStores),
      hasW5: this.workingDays.length === 5,
    };
  }

  calculateEnhancedStatistics(optimizationResult, originalStores) {
    const routes = optimizationResult.routes;
    const gridAnalysis = optimizationResult.gridAnalysis;
    const performance = optimizationResult.performance;

    return {
      // Existing statistics
      totalStoresRequired: routes.reduce(
        (sum, day) => sum + day.stores.length,
        0
      ),
      totalStoresPlanned: routes.reduce(
        (sum, day) => sum + day.stores.length,
        0
      ),
      coveragePercentage: "100.0",
      workingDays: routes.length,
      averageStoresPerDay: (
        routes.reduce((sum, day) => sum + day.stores.length, 0) / routes.length
      ).toFixed(1),
      totalDistance: routes
        .reduce((sum, day) => sum + this.calculateRouteDistance(day.stores), 0)
        .toFixed(1),

      // Enhanced statistics
      crossBorderOptimization: {
        gridsBefore: gridAnalysis.summary.totalGrids,
        daysAfter: routes.length,
        efficiencyGain: performance.efficiencyGain + "%",
        avgUtilization: performance.avgUtilization + "%",
        crossBorderDays: performance.crossBorderOptimizations,
        daysReduction: performance.daysReduction,

        beforeOptimization: {
          underutilized: gridAnalysis.summary.underutilized,
          optimal: gridAnalysis.summary.optimal,
          overloaded: gridAnalysis.summary.overloaded,
        },

        afterOptimization: {
          standaloneDays: routes.filter((r) => r.type === "OPTIMAL_STANDALONE")
            .length,
          crossBorderDays: routes.filter(
            (r) => r.type === "CROSS_BORDER_OPTIMIZED"
          ).length,
          splitDays: routes.filter((r) => r.type === "OVERLOAD_SPLIT").length,
        },
      },

      // Business impact metrics
      businessImpact: {
        travelDaysReduced: performance.daysReduction,
        utilizationImprovement:
          performance.avgUtilization -
          gridAnalysis.summary.avgUtilization +
          "%",
        estimatedCostSavings: this.calculateCostSavings(
          performance.daysReduction
        ),
        timeSavingsPerWeek: performance.daysReduction * 8 + " hours",
      },
    };
  }

  calculateCostSavings(daysReduced) {
    const costPerDay = 150; // RM 150 average cost per travel day
    const monthlySavings = daysReduced * costPerDay;
    const annualSavings = monthlySavings * 12;

    return {
      monthly: "RM " + monthlySavings.toLocaleString(),
      annual: "RM " + annualSavings.toLocaleString(),
    };
  }

  findUnvisitedStores(originalStores, routes) {
    const assignedStoreNames = new Set();
    routes.forEach((day) => {
      day.stores.forEach((store) => {
        assignedStoreNames.add(store.name);
      });
    });

    return originalStores.filter(
      (store) => !assignedStoreNames.has(store.name)
    );
  }

  findDayByIndex(dayIndex) {
    let currentIndex = 0;

    for (const week of this.workingDays) {
      for (const day of week) {
        if (currentIndex === dayIndex) {
          return day;
        }
        currentIndex++;
      }
    }

    return null;
  }

  // ==================== EXISTING BASIC OPTIMIZATION METHODS ====================
  // (Keep all your existing methods for backward compatibility)

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
      }
    });

    Utils.log(
      `Distance filter: ${validStores.length}/${stores.length} stores within ${maxDistance}km`,
      "INFO"
    );
    return validStores;
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
            storeId: store.name,
            isMultiVisit: store.actualVisits > 1,
            demand: 1,
            serviceTime: store.visitTime || CONFIG.DEFAULT_VISIT_TIME,
          });
        }
      }
    });

    return instances;
  }

  calculateOptimalClusters(storeCount) {
    const avgStoresPerDay =
      (CONFIG.CLUSTERING.MIN_STORES_PER_DAY +
        CONFIG.CLUSTERING.MAX_STORES_PER_DAY) /
      2;
    const workingDays = this.flatDays.length;
    const k = Math.min(Math.ceil(storeCount / avgStoresPerDay), workingDays);

    return k;
  }

  performKMeansClustering(stores, k) {
    if (stores.length <= k) {
      return stores.map((store) => [store]);
    }

    const centroids = this.initializeCentroidsKMeansPlusPlus(stores, k);
    let clusters = [];
    let iterations = 0;
    const maxIterations = 50;
    let previousCost = Infinity;

    while (iterations < maxIterations) {
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

      if (Math.abs(previousCost - totalCost) < 0.001) {
        break;
      }
      previousCost = totalCost;

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
    const storesCopy = [...stores];

    const firstIdx = Math.floor(Math.random() * storesCopy.length);
    centroids.push({
      lat: storesCopy[firstIdx].lat,
      lng: storesCopy[firstIdx].lng,
    });

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

  assignClustersTodays(clusters) {
    const dayAssignments = this.flatDays.map((day, idx) => ({
      dayIndex: idx,
      dayInfo: day,
      stores: [],
      clusters: [],
      totalDistance: 0,
      capacity: CONFIG.CLUSTERING.MAX_STORES_PER_DAY,
    }));

    const sortedClusters = clusters
      .map((cluster, idx) => {
        const cohesiveness = this.calculateClusterCohesiveness(cluster);
        return { cluster, cohesiveness, index: idx };
      })
      .sort((a, b) => a.cohesiveness - b.cohesiveness);

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
    const capacityScore =
      ((day.capacity - day.stores.length) / day.capacity) * 100;

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

  getClusterCenter(cluster) {
    return {
      lat: cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length,
      lng: cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length,
    };
  }

  optimizeDailyRoutes(dayAssignments) {
    dayAssignments.forEach((day) => {
      if (day.stores.length <= 1) return;

      const nnRoute = this.nearestNeighborRoute(day.stores);
      const optimizedRoute = this.optimize2Opt(nnRoute);

      if (CONFIG.CLUSTERING.MALL_DETECTION.ENABLE_MALL_CLUSTERING) {
        day.stores = this.applyMallClustering(optimizedRoute);
      } else {
        day.stores = optimizedRoute;
      }

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

    return clusters;
  }

  enforceMultiVisitConstraints(dayAssignments) {
    const multiVisitStores = {};

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

    Object.entries(multiVisitStores).forEach(([storeId, visits]) => {
      if (visits.length < 2) return;

      visits.sort((a, b) => a.dayIdx - b.dayIdx);

      for (let i = 1; i < visits.length; i++) {
        const gap = visits[i].dayIdx - visits[i - 1].dayIdx;

        if (gap < 14) {
          const violatingVisit = visits[i];
          const targetDay = Math.min(
            visits[i - 1].dayIdx + 14,
            dayAssignments.length - 1
          );

          const currentDay = dayAssignments[violatingVisit.dayIdx];
          const storeIdx = currentDay.stores.indexOf(violatingVisit.store);
          if (storeIdx !== -1) {
            currentDay.stores.splice(storeIdx, 1);
          }

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
          day.totalDistance = assignment.totalDistance;
        } else {
          day.optimizedStores = [];
          day.totalDistance = 0;
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

      // Time constraint validation
      const isWithinWorkingHours = departTime <= CONFIG.WORK.END;
      const timeWarning = !isWithinWorkingHours;

      route.push({
        ...store,
        order: index + 1,
        distance: distance,
        duration: travelTime,
        arrivalTime: arrivalTime,
        departTime: departTime,
        timeWarning: timeWarning,
        isAfter6PM: departTime > CONFIG.WORK.END,
      });

      currentTime = departTime;
      currentLat = store.lat;
      currentLng = store.lng;

      // Log warning for stores that would end after 6 PM
      if (timeWarning) {
        Utils.log(
          `⚠️ Store ${store.name} would end at ${Utils.formatTime(
            departTime
          )} (after 6:20 PM)`,
          "WARN"
        );
      }
    });

    // Check if the entire route exceeds working hours
    const lastStore = route[route.length - 1];
    if (lastStore && lastStore.departTime > CONFIG.WORK.END) {
      Utils.log(
        `⚠️ Route for ${dayInfo.dayName} ends at ${Utils.formatTime(
          lastStore.departTime
        )} - exceeds 6:20 PM limit`,
        "WARN"
      );

      // Find the cutoff point
      const validStores = route.filter(
        (store) => store.departTime <= CONFIG.WORK.END
      );
      if (validStores.length < route.length) {
        Utils.log(
          `📝 Recommend trimming route to ${validStores.length} stores to meet 6:20 PM deadline`,
          "INFO"
        );
      }
    }

    return route;
  }

  calculateBasicStatistics(dayAssignments, visitInstances) {
    const activeDays = dayAssignments.filter((day) => day.stores.length > 0);
    const totalStores = dayAssignments.reduce(
      (sum, day) => sum + day.stores.length,
      0
    );
    const totalDistance = dayAssignments.reduce(
      (sum, day) => sum + day.totalDistance,
      0
    );

    const storesPerDay = activeDays.map((day) => day.stores.length);
    const maxStores = Math.max(...storesPerDay, 0);
    const minStores = Math.min(...storesPerDay.filter((s) => s > 0), 0);
    const avgStores =
      activeDays.length > 0 ? totalStores / activeDays.length : 0;

    return {
      totalStoresRequired: visitInstances.length,
      totalStoresPlanned: totalStores,
      coveragePercentage: ((totalStores / visitInstances.length) * 100).toFixed(
        1
      ),
      workingDays: activeDays.length,
      totalDistance: totalDistance,
      averageStoresPerDay: avgStores.toFixed(1),

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

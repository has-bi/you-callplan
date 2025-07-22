// ==================== CROSS-BORDER GRID OPTIMIZER ====================
class CrossBorderOptimizer {
  constructor(config = {}) {
    this.config = {
      GRID_SIZE: config.gridSize || 0.02, // ~2.2km grid cells
      CAPACITY_PER_DAY: config.capacityPerDay || 13,
      MIN_STORES_PER_DAY: config.minStoresPerDay || 8,
      MAX_CROSS_BORDER_DISTANCE: config.maxDistance || 5,
      BORDER_THRESHOLD: config.borderThreshold || 0.7,
      ...config,
    };
  }

  // Main optimization entry point
  optimize(stores, workingDays) {
    Utils.log("🚀 Starting Cross-Border Route Optimization", "INFO");

    // Phase 1: Create grid-based clusters
    const gridAnalysis = this.createGridClusters(stores);
    Utils.log(`📊 Created ${gridAnalysis.summary.totalGrids} grids`, "INFO");

    // Phase 2: Optimize cross-border capacity
    const optimizedDays = this.performCrossBorderOptimization(gridAnalysis);
    Utils.log(`🎯 Optimized to ${optimizedDays.length} days`, "INFO");

    // Phase 3: Internal route optimization
    const finalRoutes = this.optimizeInternalRoutes(optimizedDays);

    return {
      routes: finalRoutes,
      gridAnalysis: gridAnalysis,
      performance: this.calculatePerformanceMetrics(gridAnalysis, finalRoutes),
    };
  }

  // Grid-based clustering with neighbor detection
  createGridClusters(stores) {
    const clusters = new Map();

    // Group stores by grid coordinates
    stores.forEach((store) => {
      const gridKey = this.calculateGridKey(store.lat, store.lng);

      if (!clusters.has(gridKey)) {
        clusters.set(gridKey, {
          gridKey,
          stores: [],
          center: null,
          neighbors: new Set(),
          borderStores: [],
        });
      }

      clusters.get(gridKey).stores.push(store);
    });

    // Calculate cluster properties
    clusters.forEach((cluster, gridKey) => {
      cluster.center = this.calculateClusterCenter(cluster.stores);
      cluster.neighbors = this.findNeighboringGrids(gridKey, clusters);
      cluster.borderStores = this.identifyBorderStores(cluster);
    });

    return this.analyzeGridCapacity(clusters);
  }

  // Capacity analysis and categorization
  analyzeGridCapacity(clusters) {
    const analysis = {
      underutilized: [],
      optimal: [],
      overloaded: [],
      summary: {},
    };

    clusters.forEach((cluster, gridKey) => {
      const storeCount = cluster.stores.length;

      if (storeCount < this.config.MIN_STORES_PER_DAY) {
        analysis.underutilized.push({
          ...cluster,
          deficit: this.config.CAPACITY_PER_DAY - storeCount,
          fillPriority: this.calculateFillPriority(cluster),
        });
      } else if (storeCount <= this.config.CAPACITY_PER_DAY) {
        analysis.optimal.push(cluster);
      } else {
        analysis.overloaded.push({
          ...cluster,
          surplus: storeCount - this.config.CAPACITY_PER_DAY,
          spilloverCandidates: cluster.borderStores.slice(
            0,
            storeCount - this.config.CAPACITY_PER_DAY
          ),
        });
      }
    });

    analysis.summary = {
      totalGrids: clusters.size,
      underutilized: analysis.underutilized.length,
      optimal: analysis.optimal.length,
      overloaded: analysis.overloaded.length,
      avgUtilization: this.calculateAverageUtilization(clusters),
    };

    return analysis;
  }

  // Cross-border optimization logic
  performCrossBorderOptimization(analysis) {
    const optimizedDays = [];
    const processedGrids = new Set();

    // Step 1: Handle overloaded grids with smart splitting
    analysis.overloaded.forEach((overloadedGrid) => {
      if (processedGrids.has(overloadedGrid.gridKey)) return;

      const splitResult = this.handleOverloadedGrid(overloadedGrid);
      optimizedDays.push(...splitResult.days);
      processedGrids.add(overloadedGrid.gridKey);
    });

    // Step 2: Optimize underutilized grids with cross-border filling
    const remainingUnderutilized = analysis.underutilized.filter(
      (grid) => !processedGrids.has(grid.gridKey)
    );

    const filledDays = this.optimizeUnderutilizedGrids(
      remainingUnderutilized,
      processedGrids
    );
    optimizedDays.push(...filledDays);

    // Step 3: Add optimal grids as standalone days
    analysis.optimal.forEach((optimalGrid) => {
      if (!processedGrids.has(optimalGrid.gridKey)) {
        optimizedDays.push({
          type: "OPTIMAL_STANDALONE",
          stores: optimalGrid.stores,
          primaryGrid: optimalGrid.gridKey,
          utilization: optimalGrid.stores.length / this.config.CAPACITY_PER_DAY,
          crossBorderInfo: { count: 0, sources: [] },
        });
      }
    });

    return optimizedDays;
  }

  // Smart handling of overloaded grids with time constraints
  handleOverloadedGrid(overloadedGrid) {
    const days = [];
    const totalStores = overloadedGrid.stores.length;

    // Calculate splits based on both capacity and time constraints
    let numSplits = Math.ceil(totalStores / this.config.CAPACITY_PER_DAY);

    // Estimate if time constraints require additional splits
    const estimatedTimePerStore = 45; // minutes (30 visit + 15 travel/buffer average)
    const maxStoresForTime = Math.floor(
      (CONFIG.WORK.END - CONFIG.WORK.START - 90) / estimatedTimePerStore
    ); // 90 min for breaks

    if (this.config.CAPACITY_PER_DAY > maxStoresForTime) {
      numSplits = Math.max(
        numSplits,
        Math.ceil(totalStores / maxStoresForTime)
      );
      Utils.log(
        `Overloaded grid ${overloadedGrid.gridKey} requires ${numSplits} splits due to time constraints`,
        "INFO"
      );
    }

    // Split stores into multiple days
    for (let i = 0; i < numSplits; i++) {
      const startIdx = i * Math.floor(totalStores / numSplits);
      const endIdx =
        i === numSplits - 1
          ? totalStores
          : (i + 1) * Math.floor(totalStores / numSplits);
      let dayStores = overloadedGrid.stores.slice(startIdx, endIdx);

      // Validate and trim for time constraints
      if (!this.validateTimeConstraints(dayStores)) {
        dayStores = this.trimStoresForTimeConstraints(dayStores);
        Utils.log(
          `Split ${i + 1} of grid ${overloadedGrid.gridKey} trimmed to ${
            dayStores.length
          } stores for time constraints`,
          "WARN"
        );
      }

      days.push({
        type: "OVERLOAD_SPLIT",
        stores: dayStores,
        primaryGrid: overloadedGrid.gridKey,
        splitIndex: i + 1,
        totalSplits: numSplits,
        utilization: dayStores.length / this.config.CAPACITY_PER_DAY,
        crossBorderInfo: { count: 0, sources: [] },
        estimatedEndTime: this.calculateEstimatedEndTime(dayStores),
      });
    }

    return { days };
  }

  // Optimize underutilized grids with cross-border filling
  optimizeUnderutilizedGrids(underutilizedGrids, processedGrids) {
    const optimizedDays = [];
    const localProcessed = new Set();

    // Sort by fill priority
    underutilizedGrids
      .sort((a, b) => b.fillPriority - a.fillPriority)
      .forEach((primaryGrid) => {
        if (
          localProcessed.has(primaryGrid.gridKey) ||
          processedGrids.has(primaryGrid.gridKey)
        ) {
          return;
        }

        const optimizedDay = this.createOptimizedDay(
          primaryGrid,
          underutilizedGrids,
          localProcessed
        );

        if (optimizedDay.stores.length >= this.config.MIN_STORES_PER_DAY) {
          optimizedDays.push(optimizedDay);
          localProcessed.add(primaryGrid.gridKey);
          optimizedDay.crossBorderInfo.sources.forEach((gridKey) =>
            localProcessed.add(gridKey)
          );
        }
      });

    return optimizedDays;
  }

  // Create optimized day with cross-border filling and time constraints
  createOptimizedDay(primaryGrid, availableGrids, processed) {
    let dayStores = [...primaryGrid.stores];
    const crossBorderSources = [];

    // Check if primary grid stores fit within time constraints
    if (!this.validateTimeConstraints(dayStores)) {
      // If even primary grid exceeds time, split it
      dayStores = this.trimStoresForTimeConstraints(dayStores);
      Utils.log(
        `Primary grid ${primaryGrid.gridKey} trimmed for time constraints: ${dayStores.length} stores`,
        "WARN"
      );
    }

    const remainingCapacity = this.config.CAPACITY_PER_DAY - dayStores.length;

    if (remainingCapacity > 0) {
      const fillResult = this.smartFillFromNeighbors(
        primaryGrid,
        availableGrids,
        remainingCapacity,
        processed
      );

      // Validate that added stores still fit within time constraints
      const candidateStores = [...dayStores, ...fillResult.addedStores];
      if (this.validateTimeConstraints(candidateStores)) {
        dayStores.push(...fillResult.addedStores);
        crossBorderSources.push(...fillResult.sourceGrids);
      } else {
        // Add stores one by one until time limit is reached
        for (const store of fillResult.addedStores) {
          const testStores = [...dayStores, store];
          if (this.validateTimeConstraints(testStores)) {
            dayStores.push(store);
            if (!crossBorderSources.includes(store.gridKey)) {
              crossBorderSources.push(store.gridKey);
            }
          } else {
            break; // Stop adding if time constraint would be violated
          }
        }
      }
    }

    return {
      type: "CROSS_BORDER_OPTIMIZED",
      stores: dayStores,
      primaryGrid: primaryGrid.gridKey,
      utilization: dayStores.length / this.config.CAPACITY_PER_DAY,
      crossBorderInfo: {
        count: dayStores.length - primaryGrid.stores.length,
        sources: crossBorderSources,
      },
      estimatedEndTime: this.calculateEstimatedEndTime(dayStores),
    };
  }

  // Smart neighbor filling with compatibility scoring
  smartFillFromNeighbors(primaryGrid, availableGrids, capacity, processed) {
    const addedStores = [];
    const sourceGrids = [];

    // Find compatible neighbors within distance threshold
    const compatibleNeighbors = availableGrids
      .filter(
        (grid) =>
          !processed.has(grid.gridKey) && grid.gridKey !== primaryGrid.gridKey
      )
      .map((grid) => ({
        ...grid,
        distance: Utils.distance(
          primaryGrid.center.lat,
          primaryGrid.center.lng,
          grid.center.lat,
          grid.center.lng
        ),
        compatibility: this.calculateGridCompatibility(primaryGrid, grid),
      }))
      .filter(
        (grid) =>
          grid.distance <= this.config.MAX_CROSS_BORDER_DISTANCE &&
          grid.compatibility > 0.3
      )
      .sort((a, b) => b.compatibility - a.compatibility);

    let remainingCapacity = capacity;

    compatibleNeighbors.forEach((neighbor) => {
      if (remainingCapacity <= 0) return;

      const canTake = Math.min(remainingCapacity, neighbor.stores.length);
      const storesToTake = this.selectBestStoresForTransfer(
        neighbor.stores,
        primaryGrid.center,
        canTake
      );

      if (storesToTake.length > 0) {
        addedStores.push(...storesToTake);
        sourceGrids.push(neighbor.gridKey);
        remainingCapacity -= storesToTake.length;

        // Update neighbor's remaining stores
        neighbor.stores = neighbor.stores.filter(
          (s) => !storesToTake.includes(s)
        );
      }
    });

    return { addedStores, sourceGrids };
  }

  // Internal route optimization using 2-opt
  optimizeInternalRoutes(optimizedDays) {
    return optimizedDays.map((day) => {
      if (day.stores.length > 2) {
        day.stores = this.optimize2Opt(day.stores);
      }
      return day;
    });
  }

  // 2-opt route optimization
  optimize2Opt(stores) {
    if (stores.length <= 3) return stores;

    let improved = true;
    let currentRoute = [...stores];

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

  // Helper methods
  calculateGridKey(lat, lng) {
    const gridX = Math.floor(lat / this.config.GRID_SIZE);
    const gridY = Math.floor(lng / this.config.GRID_SIZE);
    return `${gridX}_${gridY}`;
  }

  findNeighboringGrids(gridKey, allClusters) {
    const [gridX, gridY] = gridKey.split("_").map(Number);
    const neighbors = new Set();

    // Check 8-directional neighbors
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const neighborKey = `${gridX + dx}_${gridY + dy}`;
        if (allClusters.has(neighborKey)) {
          neighbors.add(neighborKey);
        }
      }
    }

    return neighbors;
  }

  identifyBorderStores(cluster) {
    if (!cluster.center || cluster.stores.length <= 2) return [];

    const gridRadiusKm = (this.config.GRID_SIZE * 111) / 2;
    const borderThreshold = gridRadiusKm * this.config.BORDER_THRESHOLD;

    return cluster.stores.filter((store) => {
      const distanceFromCenter = Utils.distance(
        store.lat,
        store.lng,
        cluster.center.lat,
        cluster.center.lng
      );
      return distanceFromCenter > borderThreshold;
    });
  }

  calculateFillPriority(cluster) {
    const avgSales =
      cluster.stores.reduce((sum, s) => sum + (s.salesL6M || 0), 0) /
      cluster.stores.length;
    const centralityScore = this.calculateCentralityScore(cluster);
    const accessibilityScore = cluster.neighbors.size / 8;

    return avgSales / 100000 + centralityScore + accessibilityScore * 0.5;
  }

  calculateCentralityScore(cluster) {
    // Simple centrality based on distance from home base
    const distance = Utils.distance(
      CONFIG.START.LAT,
      CONFIG.START.LNG,
      cluster.center.lat,
      cluster.center.lng
    );
    return Math.max(0, 1 - distance / 40); // 40km max distance
  }

  calculateGridCompatibility(grid1, grid2) {
    const businessCompatibility =
      Math.min(grid1.stores.length, grid2.stores.length) /
      Math.max(grid1.stores.length, grid2.stores.length);

    const distance = Utils.distance(
      grid1.center.lat,
      grid1.center.lng,
      grid2.center.lat,
      grid2.center.lng
    );
    const distanceScore = Math.max(
      0,
      1 - distance / this.config.MAX_CROSS_BORDER_DISTANCE
    );

    return businessCompatibility * 0.4 + distanceScore * 0.6;
  }

  selectBestStoresForTransfer(stores, targetCenter, count) {
    return stores
      .map((store) => ({
        ...store,
        transferScore: this.calculateTransferScore(store, targetCenter),
      }))
      .sort((a, b) => b.transferScore - a.transferScore)
      .slice(0, count);
  }

  calculateTransferScore(store, targetCenter) {
    const distance = Utils.distance(
      store.lat,
      store.lng,
      targetCenter.lat,
      targetCenter.lng
    );
    const distanceScore = Math.max(
      0,
      1 - distance / this.config.MAX_CROSS_BORDER_DISTANCE
    );
    const businessScore = (store.salesL6M || 0) / 100000;

    return distanceScore * 0.6 + businessScore * 0.4;
  }

  calculateClusterCenter(stores) {
    const lat = stores.reduce((sum, s) => sum + s.lat, 0) / stores.length;
    const lng = stores.reduce((sum, s) => sum + s.lng, 0) / stores.length;
    return { lat, lng };
  }

  calculateAverageUtilization(clusters) {
    const totalStores = Array.from(clusters.values()).reduce(
      (sum, cluster) => sum + cluster.stores.length,
      0
    );
    const totalCapacity = clusters.size * this.config.CAPACITY_PER_DAY;
    return Math.round((totalStores / totalCapacity) * 100);
  }

  calculatePerformanceMetrics(gridAnalysis, finalRoutes) {
    const beforeDays =
      gridAnalysis.summary.underutilized +
      gridAnalysis.summary.optimal +
      gridAnalysis.summary.overloaded * 1.5;
    const afterDays = finalRoutes.length;

    // Calculate time constraint compliance
    const routesWithTimeValidation = finalRoutes.filter(
      (route) =>
        route.estimatedEndTime && route.estimatedEndTime <= CONFIG.WORK.END
    );
    const timeComplianceRate =
      finalRoutes.length > 0
        ? (routesWithTimeValidation.length / finalRoutes.length) * 100
        : 100;

    return {
      daysReduction: Math.max(0, beforeDays - afterDays),
      efficiencyGain: Math.round(((beforeDays - afterDays) / beforeDays) * 100),
      avgUtilization: Math.round(
        (finalRoutes.reduce((sum, day) => sum + day.utilization, 0) /
          finalRoutes.length) *
          100
      ),
      crossBorderOptimizations: finalRoutes.filter(
        (day) => day.crossBorderInfo.count > 0
      ).length,
      timeComplianceRate: Math.round(timeComplianceRate),
      averageEndTime: this.calculateAverageEndTime(finalRoutes),
    };
  }

  // Validate that stores can be completed within working hours
  validateTimeConstraints(stores) {
    if (!stores || stores.length === 0) return true;

    const estimatedEndTime = this.calculateEstimatedEndTime(stores);
    return estimatedEndTime <= CONFIG.WORK.END;
  }

  // Calculate estimated end time for a list of stores
  calculateEstimatedEndTime(stores) {
    if (!stores || stores.length === 0) return CONFIG.WORK.START;

    let currentTime = CONFIG.WORK.START;
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;
    let hasBreak = false;

    const breakStart = CONFIG.LUNCH.START; // Use lunch break as default
    const breakEnd = CONFIG.LUNCH.END;

    stores.forEach((store) => {
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

      // Add visit time and buffer
      const visitDuration =
        CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);
      currentTime += visitDuration;

      // Update position
      currentLat = store.lat;
      currentLng = store.lng;
    });

    return currentTime;
  }

  // Trim stores from a day to fit within time constraints
  trimStoresForTimeConstraints(stores) {
    if (!stores || stores.length === 0) return stores;

    // Sort by priority and business value for smart trimming
    const sortedStores = stores.sort((a, b) => {
      const priorityA = parseInt(a.priority.replace("P", "")) || 999;
      const priorityB = parseInt(b.priority.replace("P", "")) || 999;

      if (priorityA !== priorityB) {
        return priorityA - priorityB; // Lower priority number = higher priority
      }

      // Secondary sort by sales value
      return (b.salesL6M || 0) - (a.salesL6M || 0);
    });

    // Add stores one by one until time limit is reached
    const trimmedStores = [];
    for (const store of sortedStores) {
      const testStores = [...trimmedStores, store];
      if (this.validateTimeConstraints(testStores)) {
        trimmedStores.push(store);
      } else {
        break; // Stop adding if time constraint would be violated
      }
    }

    return trimmedStores;
  }

  // Calculate average end time across all routes
  calculateAverageEndTime(routes) {
    if (!routes || routes.length === 0) return CONFIG.WORK.START;

    const validRoutes = routes.filter((route) => route.estimatedEndTime);
    if (validRoutes.length === 0) return CONFIG.WORK.START;

    const avgEndTime =
      validRoutes.reduce((sum, route) => sum + route.estimatedEndTime, 0) /
      validRoutes.length;
    return Math.round(avgEndTime);
  }
}

// ==================== CLEAN STRUCTURED LAYERED OPTIMIZER ====================
class StructuredLayeredOptimizer {
  static optimizeWorkingDays(workingDays) {
    Utils.log(
      "=== STARTING 17-STEP STRUCTURED LAYERED OPTIMIZATION ===",
      "INFO"
    );

    const result = this.initializeResult();

    // PHASE 1: P1 Foundation (Steps 1-6)
    this.executeP1Foundation(workingDays, result);

    // PHASE 2: P2 Enhancement (Steps 7-11)
    this.executeP2Enhancement(workingDays, result);

    // PHASE 3: P3 Enhancement (Steps 12-15)
    this.executeP3Enhancement(workingDays, result);

    // PHASE 4: Finalization (Steps 16-17)
    this.executeFinalization(workingDays, result);

    this.logOptimizationSummary(result);
    Utils.log("=== 17-STEP STRUCTURED OPTIMIZATION COMPLETED ===", "INFO");

    return result;
  }

  // ==================== PHASE EXECUTION METHODS ====================

  static executeP1Foundation(workingDays, result) {
    Utils.log("🎯 PHASE 1: P1 FOUNDATION (Steps 1-6)", "INFO");

    // Step 1: Load ALL P1 stores
    const p1Stores = this.loadPriorityStores("P1");
    result.step1_p1Loading.storesLoaded = p1Stores.length;
    Utils.log(`✅ Step 1: ${p1Stores.length} P1 stores loaded`, "INFO");

    // Step 2: Create P1 area groups (not clusters)
    const p1Areas = this.createP1AreaGroups(p1Stores);
    result.step2_p1Clustering.clustersCreated = p1Areas.length;
    Utils.log(`✅ Step 2: ${p1Areas.length} P1 areas created`, "INFO");

    // Step 3: Map P1 areas to days
    this.clearWorkingDays(workingDays);
    const mappingResult = this.mapP1AreasTodays(workingDays, p1Areas);
    result.step3_p1Mapping = mappingResult;
    Utils.log(
      `✅ Step 3: ${mappingResult.storesAssigned} P1 stores assigned`,
      "INFO"
    );

    // Steps 4-6: Analyze current state
    const analysis = this.analyzeDayOptimization(workingDays, "After P1");
    result.step4_5_6_analysis = analysis;
    this.logDayAnalysis(analysis, "P1 FOUNDATION");
  }

  static executeP2Enhancement(workingDays, result) {
    Utils.log("📦 PHASE 2: P2 ENHANCEMENT (Steps 7-11)", "INFO");

    // Step 7: Load P2 stores
    const p2Stores = this.loadPriorityStores("P2");
    result.step7_p2Loading.storesLoaded = p2Stores.length;
    Utils.log(`✅ Step 7: ${p2Stores.length} P2 stores loaded`, "INFO");

    if (p2Stores.length > 0) {
      // Step 8: Create P2 clusters
      const p2Clusters = this.createFillerClusters(p2Stores, "P2");
      result.step8_p2Clustering.clustersCreated = p2Clusters.length;

      // Step 9: Fill non-optimized days
      const nonOptResult = this.fillNonOptimizedDays(
        workingDays,
        p2Clusters,
        result.step4_5_6_analysis.nonOptimizedDays
      );
      result.step9_p2NonOptimized = nonOptResult;

      // Step 10: Fill empty days
      const emptyResult = this.fillEmptyDays(
        workingDays,
        p2Clusters,
        result.step4_5_6_analysis.emptyDays
      );
      result.step10_p2Empty = emptyResult;

      // Step 11: Re-analyze
      const analysis = this.analyzeDayOptimization(workingDays, "After P2");
      result.step11_analysis = analysis;
      this.logDayAnalysis(analysis, "P2 ENHANCEMENT");
    } else {
      Utils.log("⚠️ Steps 8-11 skipped: No P2 stores available", "WARN");
      result.step11_analysis = result.step4_5_6_analysis;
    }
  }

  static executeP3Enhancement(workingDays, result) {
    Utils.log("📈 PHASE 3: P3 ENHANCEMENT (Steps 12-15)", "INFO");

    // Step 12: Load P3 stores
    const p3Stores = this.loadPriorityStores("P3");
    result.step12_p3Loading.storesLoaded = p3Stores.length;
    Utils.log(`✅ Step 12: ${p3Stores.length} P3 stores loaded`, "INFO");

    if (p3Stores.length > 0) {
      // Step 13: Create P3 clusters
      const p3Clusters = this.createFillerClusters(p3Stores, "P3");
      result.step13_p3Clustering.clustersCreated = p3Clusters.length;

      // Step 14: Fill non-optimized days
      const nonOptResult = this.fillNonOptimizedDays(
        workingDays,
        p3Clusters,
        result.step11_analysis.nonOptimizedDays
      );
      result.step14_p3NonOptimized = nonOptResult;

      // Step 15: Fill empty days
      const emptyResult = this.fillEmptyDays(
        workingDays,
        p3Clusters,
        result.step11_analysis.emptyDays
      );
      result.step15_p3Empty = emptyResult;
    } else {
      Utils.log("⚠️ Steps 13-15 skipped: No P3 stores available", "WARN");
    }
  }

  static executeFinalization(workingDays, result) {
    Utils.log("🔧 PHASE 4: FINALIZATION (Steps 16-17)", "INFO");

    // Step 16: Reorganize routes
    const reorganizeResult = this.reorganizeAllRoutes(workingDays);
    result.step16_reorganize = reorganizeResult;

    // Step 17: Final time validation
    const finalResult = this.validateFinalTiming(workingDays);
    result.step17_finalCheck = finalResult;

    Utils.log(
      `✅ Finalization: ${reorganizeResult.daysReorganized} routes optimized, ${finalResult.timeViolations} violations`,
      "INFO"
    );
  }

  // ==================== STORE LOADING METHODS ====================

  static loadPriorityStores(priority) {
    Utils.log(`📋 Loading ${priority} stores...`, "INFO");

    const sheet = this.getSheet();
    if (!sheet) return [];

    const priorityConfig = CONFIG.PRIORITIES[priority];
    if (!priorityConfig) {
      Utils.log(`❌ ${priority} configuration not found`, "ERROR");
      return [];
    }

    if (priority === "P1") {
      return this.loadAllP1Stores(sheet, priorityConfig);
    } else {
      return this.loadFillerStores(sheet, priorityConfig, priority);
    }
  }

  static loadAllP1Stores(sheet, priorityConfig) {
    Utils.log(`🎯 Loading ALL P1 stores (no frequency filtering)`, "INFO");

    const stores = [];
    const { col, lastRow, stats } = this.getSheetInfo(sheet, priorityConfig);

    for (let row = 4; row <= lastRow; row++) {
      const storeData = this.extractStoreData(
        sheet,
        row,
        col,
        priorityConfig,
        "P1"
      );
      if (storeData) {
        // Force at least 1 visit for ALL P1 stores
        storeData.actualVisits = Math.max(storeData.actualVisits, 1);
        storeData.isP1Store = true;
        stores.push(storeData);
        stats.validStores++;
      }
      stats.rowsProcessed++;
    }

    this.logLoadingSummary("P1", stats, stores);
    return stores;
  }

  static loadFillerStores(sheet, priorityConfig, priority) {
    if (
      priorityConfig.requiredVisits < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY
    ) {
      Utils.log(
        `⚠️ ${priority} frequency too low: ${priorityConfig.requiredVisits}`,
        "WARN"
      );
      return [];
    }

    const stores = [];
    const { col, lastRow, stats } = this.getSheetInfo(sheet, priorityConfig);

    for (let row = 4; row <= lastRow; row++) {
      const storeData = this.extractStoreData(
        sheet,
        row,
        col,
        priorityConfig,
        priority
      );
      if (storeData && storeData.actualVisits > 0) {
        storeData.isFillerStore = true;
        stores.push(storeData);
        stats.validStores++;
      }
      stats.rowsProcessed++;
    }

    this.logLoadingSummary(priority, stats, stores);
    return stores;
  }

  static extractStoreData(sheet, row, col, priorityConfig, priority) {
    try {
      const shouldVisit = sheet.getRange(row, col + 11).getValue();
      if (shouldVisit !== "YES" && shouldVisit !== true) return null;

      const name = sheet.getRange(row, col + 1).getValue();
      if (!name) return null;

      const noStr = sheet.getRange(row, col).getValue() || "";
      const lat = parseFloat(sheet.getRange(row, col + 6).getValue());
      const lng = parseFloat(sheet.getRange(row, col + 7).getValue());

      if (isNaN(lat) || isNaN(lng)) return null;

      const actualVisits =
        priority === "P1"
          ? Utils.calculateActualVisits(
              priorityConfig.requiredVisits,
              1,
              row - 4,
              priority
            )
          : 1;

      return {
        priority,
        noStr,
        name,
        retailer: sheet.getRange(row, col + 2).getValue() || "",
        district: sheet.getRange(row, col + 3).getValue() || "Unknown",
        address: sheet.getRange(row, col + 5).getValue() || "",
        lat,
        lng,
        salesL6M: parseFloat(sheet.getRange(row, col + 8).getValue()) || 0,
        baseFrequency: priorityConfig.requiredVisits,
        actualVisits,
        visits: actualVisits,
        visitTime: CONFIG.DEFAULT_VISIT_TIME,
        visitId: `${noStr}_${priority}`,
        loadedFromRow: row,
        loadedFromPriority: priority,
      };
    } catch (e) {
      return null;
    }
  }

  // ==================== CLUSTERING/GROUPING METHODS ====================

  static createP1AreaGroups(p1Stores) {
    Utils.log(
      `🗺️ Creating P1 area groups for ${p1Stores.length} stores...`,
      "INFO"
    );

    const gridSize = 0.12; // Larger areas for P1
    const areaGroups = this.groupStoresByGrid(p1Stores, gridSize, "P1_AREA");

    // Route optimize within each area
    areaGroups.forEach((area) => {
      area.stores = this.optimizeRouteWithinArea(area.stores);
      Utils.log(
        `📍 ${area.areaId}: ${area.stores.length} stores (route optimized)`,
        "INFO"
      );
    });

    this.logGroupingSummary("P1 AREAS", areaGroups, gridSize);
    return areaGroups;
  }

  static createFillerClusters(stores, priority) {
    Utils.log(
      `🗺️ Creating ${priority} clusters for ${stores.length} stores...`,
      "INFO"
    );

    const gridSize = this.getGridSizeForPriority(priority);
    const clusters = this.groupStoresByGrid(
      stores,
      gridSize,
      `${priority}_CLUSTER`
    );

    this.logGroupingSummary(`${priority} CLUSTERS`, clusters, gridSize);
    return clusters;
  }

  static groupStoresByGrid(stores, gridSize, idPrefix) {
    const groups = new Map();

    stores.forEach((store) => {
      const gridKey = this.calculateGridKey(store.lat, store.lng, gridSize);

      if (!groups.has(gridKey)) {
        groups.set(gridKey, {
          gridKey,
          stores: [],
          center: null,
          areaId: `${idPrefix}_${groups.size + 1}`,
        });
      }

      groups.get(gridKey).stores.push(store);
    });

    // Calculate centers and sort by size
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        center: this.calculateGroupCenter(group.stores),
      }))
      .sort((a, b) => b.stores.length - a.stores.length);
  }

  // ==================== DAY ASSIGNMENT METHODS ====================

  static mapP1AreasTodays(workingDays, p1Areas) {
    Utils.log(`📅 Mapping ${p1Areas.length} P1 areas to days...`, "INFO");

    const result = { daysUsed: 0, storesAssigned: 0, unassignedStores: 0 };
    let dayIndex = 0;

    for (const area of p1Areas) {
      const day = this.findDayByIndex(workingDays, dayIndex);
      if (!day) {
        result.unassignedStores += area.stores.length;
        Utils.log(
          `❌ No more days available for ${area.stores.length} P1 stores`,
          "ERROR"
        );
        continue;
      }

      const maxStores = this.calculateMaxStoresForDay(day);
      const storesToAssign = Math.min(area.stores.length, maxStores);

      if (storesToAssign < area.stores.length) {
        // Need to split large areas across multiple days
        const remainingStores = area.stores.slice(storesToAssign);
        area.stores = area.stores.slice(0, storesToAssign);

        // Try to assign remaining stores to next days
        this.assignRemainingStores(
          workingDays,
          remainingStores,
          dayIndex + 1,
          result
        );
      }

      day.optimizedStores = this.createBasicRoute(area.stores, day);
      result.storesAssigned += area.stores.length;
      result.daysUsed = Math.max(result.daysUsed, dayIndex + 1);

      Utils.log(
        `✅ Assigned ${area.stores.length} P1 stores to day ${dayIndex + 1}`,
        "INFO"
      );
      dayIndex++;
    }

    return result;
  }

  static fillNonOptimizedDays(workingDays, clusters, nonOptimizedDays) {
    if (!clusters.length || !nonOptimizedDays.length) {
      return { daysOptimized: 0, storesAdded: 0 };
    }

    Utils.log(
      `⚡ Filling ${nonOptimizedDays.length} non-optimized days...`,
      "INFO"
    );

    const result = { daysOptimized: 0, storesAdded: 0 };
    const availableClusters = [...clusters];

    nonOptimizedDays.forEach((dayData) => {
      const capacity = this.calculateRemainingCapacity(dayData.dayInfo);
      if (capacity <= 0) return;

      const cluster = this.findBestCluster(
        availableClusters,
        dayData,
        capacity
      );
      if (cluster) {
        const storesToAdd = Math.min(cluster.stores.length, capacity);
        const selectedStores = cluster.stores.splice(0, storesToAdd);

        this.addStoresToDay(dayData.dayInfo, selectedStores);
        result.storesAdded += selectedStores.length;
        result.daysOptimized++;

        if (cluster.stores.length === 0) {
          this.removeEmptyCluster(availableClusters, cluster);
        }

        Utils.log(
          `✅ Added ${selectedStores.length} stores to day ${
            dayData.globalDayIndex + 1
          }`,
          "INFO"
        );
      }
    });

    return result;
  }

  static fillEmptyDays(workingDays, clusters, emptyDays) {
    if (!clusters.length || !emptyDays.length) {
      return { daysFilled: 0, storesAdded: 0 };
    }

    Utils.log(`📦 Filling ${emptyDays.length} empty days...`, "INFO");

    const result = { daysFilled: 0, storesAdded: 0 };
    const availableClusters = [...clusters];

    emptyDays.forEach((dayData) => {
      const dayCapacity = this.calculateMaxStoresForDay(dayData.dayInfo);
      const storesForDay = this.collectStoresForDay(
        availableClusters,
        dayCapacity
      );

      if (storesForDay.length > 0) {
        dayData.dayInfo.optimizedStores = this.createBasicRoute(
          storesForDay,
          dayData.dayInfo
        );
        result.daysFilled++;
        result.storesAdded += storesForDay.length;

        Utils.log(
          `✅ Filled empty day ${dayData.globalDayIndex + 1} with ${
            storesForDay.length
          } stores`,
          "INFO"
        );
      }
    });

    return result;
  }

  // ==================== ROUTE OPTIMIZATION METHODS ====================

  static optimizeRouteWithinArea(stores) {
    if (!stores || stores.length <= 2) return stores;

    const optimized = [];
    const remaining = [...stores];
    let current = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };

    while (remaining.length > 0) {
      const nearestIndex = this.findNearestStoreIndex(remaining, current);
      const nearest = remaining.splice(nearestIndex, 1)[0];
      optimized.push({ ...nearest, areaOrder: optimized.length + 1 });
      current = nearest;
    }

    return optimized;
  }

  static reorganizeAllRoutes(workingDays) {
    let daysReorganized = 0;

    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 1) {
          dayInfo.optimizedStores = this.optimizeRouteWithinArea(
            dayInfo.optimizedStores
          );
          dayInfo.optimizedStores.forEach(
            (store, idx) => (store.order = idx + 1)
          );
          daysReorganized++;
        }
      });
    });

    Utils.log(`🔄 Reorganized ${daysReorganized} day routes`, "INFO");
    return { daysReorganized };
  }

  static validateFinalTiming(workingDays) {
    let timeViolations = 0;
    let storesRemoved = 0;
    let daysChecked = 0;

    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        if (!dayInfo.optimizedStores || dayInfo.optimizedStores.length === 0)
          return;

        daysChecked++;
        const detailedRoute = this.createDetailedRoute(
          dayInfo.optimizedStores,
          dayInfo
        );
        const lastStore = detailedRoute[detailedRoute.length - 1];

        if (lastStore && lastStore.departTime > CONFIG.WORK.END) {
          timeViolations++;
          const trimmedRoute = this.trimForTimeConstraint(detailedRoute);
          const removed = detailedRoute.length - trimmedRoute.length;

          dayInfo.optimizedStores = trimmedRoute;
          storesRemoved += removed;

          Utils.log(
            `⚠️ Time violation Week ${weekIndex + 1}, ${
              dayInfo.dayName
            }: removed ${removed} stores`,
            "WARN"
          );
        } else {
          dayInfo.optimizedStores = detailedRoute;
        }
      });
    });

    return { timeViolations, storesRemoved, daysChecked };
  }

  static createDetailedRoute(stores, dayInfo) {
    if (!stores || stores.length === 0) return [];

    const route = [];
    let currentTime = CONFIG.WORK.START; // First store arrives at 9:00 AM
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;

    const { breakStart, breakEnd } = this.getBreakTimes(dayInfo);
    let hasBreak = false;

    stores.forEach((store, index) => {
      const distance = Utils.distance(
        currentLat,
        currentLng,
        store.lat,
        store.lng
      );
      const travelTime = Math.round(distance * 3);

      // First store arrives at 9:00 AM exactly
      const arrivalTime =
        index === 0 ? CONFIG.WORK.START : currentTime + travelTime;

      // Handle break timing
      if (!hasBreak && arrivalTime >= breakStart && arrivalTime < breakEnd) {
        currentTime = breakEnd;
        hasBreak = true;
      } else {
        currentTime = arrivalTime;
      }

      const visitDuration =
        CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);
      const departTime = currentTime + visitDuration;

      route.push({
        ...store,
        order: index + 1,
        distance,
        duration: index === 0 ? 0 : travelTime,
        arrivalTime: currentTime,
        departTime,
        timeWarning: departTime > CONFIG.WORK.END,
        isAfter6PM: departTime > CONFIG.WORK.END,
        isFirstStore: index === 0,
      });

      currentTime = departTime;
      currentLat = store.lat;
      currentLng = store.lng;
    });

    return route;
  }

  // ==================== ANALYSIS METHODS ====================

  static analyzeDayOptimization(workingDays, phase) {
    const analysis = {
      emptyDays: [],
      nonOptimizedDays: [],
      optimizedDays: [],
      totalDays: 0,
    };
    const targetEndTime = 17 * 60 + 30; // 5:30 PM
    let globalDayIndex = 0;

    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        analysis.totalDays++;
        const storeCount = dayInfo.optimizedStores
          ? dayInfo.optimizedStores.length
          : 0;
        const estimatedEndTime = this.calculateEstimatedEndTime(
          dayInfo.optimizedStores,
          dayInfo
        );

        const dayData = {
          weekIndex,
          dayIndex,
          globalDayIndex,
          dayInfo,
          storeCount,
          estimatedEndTime,
          finishesEarly: estimatedEndTime < targetEndTime,
          capacity: this.calculateRemainingCapacity(dayInfo),
        };

        if (storeCount === 0) {
          analysis.emptyDays.push(dayData);
        } else if (estimatedEndTime < targetEndTime) {
          analysis.nonOptimizedDays.push(dayData);
        } else {
          analysis.optimizedDays.push(dayData);
        }

        globalDayIndex++;
      });
    });

    return analysis;
  }

  static calculateEstimatedEndTime(stores, dayInfo) {
    if (!stores || stores.length === 0) return CONFIG.WORK.START;

    let currentTime = CONFIG.WORK.START; // 9:00 AM arrival at first store
    const avgTimePerStore = 45;
    const { breakStart, breakEnd } = this.getBreakTimes(dayInfo);

    // First store: just visit time
    if (stores.length >= 1) {
      currentTime += CONFIG.DEFAULT_VISIT_TIME + CONFIG.BUFFER_TIME;
    }

    // Remaining stores: full time
    if (stores.length > 1) {
      currentTime += (stores.length - 1) * avgTimePerStore;
    }

    // Add break if needed
    if (currentTime > breakStart) {
      currentTime += breakEnd - breakStart;
    }

    return currentTime;
  }

  // ==================== UTILITY METHODS ====================

  static initializeResult() {
    return {
      step1_p1Loading: { storesLoaded: 0 },
      step2_p1Clustering: { clustersCreated: 0 },
      step3_p1Mapping: { daysUsed: 0, storesAssigned: 0 },
      step4_5_6_analysis: {
        emptyDays: [],
        nonOptimizedDays: [],
        optimizedDays: [],
      },
      step7_p2Loading: { storesLoaded: 0 },
      step8_p2Clustering: { clustersCreated: 0 },
      step9_p2NonOptimized: { daysOptimized: 0, storesAdded: 0 },
      step10_p2Empty: { daysFilled: 0, storesAdded: 0 },
      step11_analysis: { emptyDays: [], nonOptimizedDays: [] },
      step12_p3Loading: { storesLoaded: 0 },
      step13_p3Clustering: { clustersCreated: 0 },
      step14_p3NonOptimized: { daysOptimized: 0, storesAdded: 0 },
      step15_p3Empty: { daysFilled: 0, storesAdded: 0 },
      step16_reorganize: { daysReorganized: 0 },
      step17_finalCheck: { timeViolations: 0, storesRemoved: 0 },
    };
  }

  static getSheet() {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      return ss.getSheetByName(CONFIG.SHEET_NAME);
    } catch (e) {
      Utils.log(`❌ Error accessing sheet: ${e}`, "ERROR");
      return null;
    }
  }

  static getSheetInfo(sheet, priorityConfig) {
    return {
      col: priorityConfig.startCol,
      lastRow: sheet.getLastRow(),
      stats: { rowsProcessed: 0, validStores: 0, shouldVisitYes: 0 },
    };
  }

  static getGridSizeForPriority(priority) {
    const sizes = { P1: 0.12, P2: 0.1, P3: 0.12 };
    return sizes[priority] || 0.1;
  }

  static calculateGridKey(lat, lng, gridSize) {
    const gridX = Math.floor(lat / gridSize);
    const gridY = Math.floor(lng / gridSize);
    return `${gridX}_${gridY}`;
  }

  static calculateGroupCenter(stores) {
    if (!stores.length) return null;
    const lat = stores.reduce((sum, s) => sum + s.lat, 0) / stores.length;
    const lng = stores.reduce((sum, s) => sum + s.lng, 0) / stores.length;
    return { lat, lng };
  }

  static calculateMaxStoresForDay(dayInfo) {
    const { breakStart, breakEnd } = this.getBreakTimes(dayInfo);
    const availableTime =
      CONFIG.WORK.END - CONFIG.WORK.START - (breakEnd - breakStart);
    const avgTimePerStore = 45;
    return Math.min(
      Math.floor(availableTime / avgTimePerStore),
      CONFIG.CLUSTERING.MAX_STORES_PER_DAY || 15
    );
  }

  static calculateRemainingCapacity(dayInfo) {
    const currentStores = dayInfo.optimizedStores
      ? dayInfo.optimizedStores.length
      : 0;
    return Math.max(0, this.calculateMaxStoresForDay(dayInfo) - currentStores);
  }

  static getBreakTimes(dayInfo) {
    const isFriday = dayInfo.isFriday || false;
    return {
      breakStart: isFriday ? CONFIG.FRIDAY_PRAYER.START : CONFIG.LUNCH.START,
      breakEnd: isFriday ? CONFIG.FRIDAY_PRAYER.END : CONFIG.LUNCH.END,
    };
  }

  static findDayByIndex(workingDays, targetIndex) {
    let currentIndex = 0;
    for (const week of workingDays) {
      for (const dayInfo of week) {
        if (currentIndex === targetIndex) return dayInfo;
        currentIndex++;
      }
    }
    return null;
  }

  static findNearestStoreIndex(stores, current) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    stores.forEach((store, index) => {
      const distance = Utils.distance(
        current.lat,
        current.lng,
        store.lat,
        store.lng
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  static findBestCluster(clusters, dayData, capacity) {
    return (
      clusters
        .filter((cluster) => cluster.stores.length <= capacity)
        .sort((a, b) => b.stores.length - a.stores.length)[0] || null
    );
  }

  static collectStoresForDay(clusters, capacity) {
    const stores = [];
    let remaining = capacity;

    for (const cluster of clusters) {
      if (remaining <= 0) break;
      const take = Math.min(cluster.stores.length, remaining);
      stores.push(...cluster.stores.splice(0, take));
      remaining -= take;
    }

    return stores;
  }

  static addStoresToDay(dayInfo, stores) {
    if (!dayInfo.optimizedStores) dayInfo.optimizedStores = [];
    const routedStores = this.createBasicRoute(
      stores,
      dayInfo,
      dayInfo.optimizedStores.length
    );
    dayInfo.optimizedStores.push(...routedStores);
  }

  static assignRemainingStores(workingDays, stores, startDayIndex, result) {
    // Implementation for handling store overflow across multiple days
    // This would be called when P1 areas are too large for single days
  }

  static removeEmptyCluster(clusters, emptyCluster) {
    const index = clusters.indexOf(emptyCluster);
    if (index > -1) clusters.splice(index, 1);
  }

  static createBasicRoute(stores, dayInfo, startOrder = 0) {
    return stores.map((store, index) => ({
      ...store,
      order: startOrder + index + 1,
      distance: 0,
      duration: 0,
      arrivalTime: 0,
      departTime: 0,
    }));
  }

  static trimForTimeConstraint(route) {
    return route.filter((store) => store.departTime <= CONFIG.WORK.END);
  }

  static clearWorkingDays(workingDays) {
    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        dayInfo.optimizedStores = [];
      });
    });
  }

  // ==================== LOGGING METHODS ====================

  static logLoadingSummary(priority, stats, stores) {
    Utils.log(`📊 ${priority} LOADING SUMMARY:`, "INFO");
    Utils.log(`  • Rows processed: ${stats.rowsProcessed}`, "INFO");
    Utils.log(`  • Valid stores: ${stats.validStores}`, "INFO");
    Utils.log(`  • Final count: ${stores.length}`, "INFO");

    if (stores.length > 0) {
      const samples = stores.slice(0, 3);
      Utils.log(`📋 Sample ${priority} stores:`, "INFO");
      samples.forEach((store, idx) => {
        Utils.log(
          `  ${idx + 1}. ${store.noStr} - ${store.name} (${store.district})`,
          "INFO"
        );
      });
    } else {
      Utils.log(`⚠️ NO ${priority} STORES FOUND`, "WARN");
    }
  }

  static logGroupingSummary(type, groups, gridSize) {
    Utils.log(`🗺️ ${type} SUMMARY:`, "INFO");
    Utils.log(
      `  • Grid size: ${gridSize} (~${(gridSize * 111).toFixed(1)}km)`,
      "INFO"
    );
    Utils.log(`  • Groups created: ${groups.length}`, "INFO");
    Utils.log(
      `  • Stores per group: ${groups.map((g) => g.stores.length).join(", ")}`,
      "INFO"
    );

    if (groups.length > 0) {
      const avgSize =
        groups.reduce((sum, g) => sum + g.stores.length, 0) / groups.length;
      Utils.log(`  • Average size: ${avgSize.toFixed(1)} stores`, "INFO");
    }
  }

  static logDayAnalysis(analysis, phase) {
    Utils.log(`🔍 DAY ANALYSIS (${phase}):`, "INFO");
    Utils.log(`  • Empty days: ${analysis.emptyDays.length}`, "INFO");
    Utils.log(
      `  • Non-optimized days: ${analysis.nonOptimizedDays.length}`,
      "INFO"
    );
    Utils.log(`  • Optimized days: ${analysis.optimizedDays.length}`, "INFO");
    Utils.log(`  • Total days: ${analysis.totalDays}`, "INFO");

    if (analysis.emptyDays.length > 0) {
      const emptyList = analysis.emptyDays
        .map((d) => d.globalDayIndex + 1)
        .join(", ");
      Utils.log(`📋 Empty days: ${emptyList}`, "INFO");
    }

    if (analysis.nonOptimizedDays.length > 0) {
      Utils.log(`📋 Non-optimized days (finish before 5:30 PM):`, "INFO");
      analysis.nonOptimizedDays.slice(0, 5).forEach((day) => {
        Utils.log(
          `   Day ${day.globalDayIndex + 1}: ${
            day.storeCount
          } stores, ends ${Utils.formatTime(day.estimatedEndTime)}`,
          "INFO"
        );
      });
      if (analysis.nonOptimizedDays.length > 5) {
        Utils.log(
          `   ... and ${analysis.nonOptimizedDays.length - 5} more`,
          "INFO"
        );
      }
    }
  }

  static logOptimizationSummary(result) {
    Utils.log("", "INFO");
    Utils.log("📊 17-STEP OPTIMIZATION SUMMARY:", "INFO");
    Utils.log("===================================", "INFO");

    // Phase summaries
    Utils.log("🎯 P1 FOUNDATION:", "INFO");
    Utils.log(
      `  Steps 1-3: ${result.step1_p1Loading.storesLoaded} stores → ${result.step2_p1Clustering.clustersCreated} areas → ${result.step3_p1Mapping.storesAssigned} assigned`,
      "INFO"
    );
    Utils.log(
      `  Steps 4-6: ${result.step4_5_6_analysis.emptyDays.length} empty, ${result.step4_5_6_analysis.nonOptimizedDays.length} non-optimized days`,
      "INFO"
    );

    Utils.log("📦 P2 ENHANCEMENT:", "INFO");
    Utils.log(
      `  Steps 7-8: ${result.step7_p2Loading.storesLoaded} stores → ${result.step8_p2Clustering.clustersCreated} clusters`,
      "INFO"
    );
    Utils.log(
      `  Steps 9-10: ${result.step9_p2NonOptimized.storesAdded} to non-opt, ${result.step10_p2Empty.storesAdded} to empty days`,
      "INFO"
    );

    Utils.log("📈 P3 ENHANCEMENT:", "INFO");
    Utils.log(
      `  Steps 12-13: ${result.step12_p3Loading.storesLoaded} stores → ${result.step13_p3Clustering.clustersCreated} clusters`,
      "INFO"
    );
    Utils.log(
      `  Steps 14-15: ${result.step14_p3NonOptimized.storesAdded} to non-opt, ${result.step15_p3Empty.storesAdded} to empty days`,
      "INFO"
    );

    Utils.log("🔧 FINALIZATION:", "INFO");
    Utils.log(
      `  Step 16: ${result.step16_reorganize.daysReorganized} routes reorganized`,
      "INFO"
    );
    Utils.log(
      `  Step 17: ${result.step17_finalCheck.timeViolations} violations, ${result.step17_finalCheck.storesRemoved} stores removed`,
      "INFO"
    );

    // Overall metrics
    const totalLoaded =
      result.step1_p1Loading.storesLoaded +
      result.step7_p2Loading.storesLoaded +
      result.step12_p3Loading.storesLoaded;
    const totalAssigned =
      result.step3_p1Mapping.storesAssigned +
      result.step9_p2NonOptimized.storesAdded +
      result.step10_p2Empty.storesAdded +
      result.step14_p3NonOptimized.storesAdded +
      result.step15_p3Empty.storesAdded;

    Utils.log("", "INFO");
    Utils.log("📊 OVERALL RESULTS:", "INFO");
    Utils.log(`  • Total stores loaded: ${totalLoaded}`, "INFO");
    Utils.log(`  • Total stores assigned: ${totalAssigned}`, "INFO");
    Utils.log(
      `  • P1 coverage: ${result.step3_p1Mapping.storesAssigned}/${
        result.step1_p1Loading.storesLoaded
      } (${
        result.step1_p1Loading.storesLoaded > 0
          ? (
              (result.step3_p1Mapping.storesAssigned /
                result.step1_p1Loading.storesLoaded) *
              100
            ).toFixed(1)
          : 0
      }%)`,
      "INFO"
    );
    Utils.log(
      `  • Final time compliance: ${
        result.step17_finalCheck.daysChecked -
        result.step17_finalCheck.timeViolations
      }/${result.step17_finalCheck.daysChecked} days`,
      "INFO"
    );

    // Success indicators
    if (
      result.step1_p1Loading.storesLoaded > 0 &&
      result.step3_p1Mapping.storesAssigned ===
        result.step1_p1Loading.storesLoaded
    ) {
      Utils.log("✅ P1 SUCCESS: All P1 stores scheduled", "INFO");
    } else if (result.step1_p1Loading.storesLoaded > 0) {
      Utils.log(
        `❌ P1 INCOMPLETE: ${
          result.step1_p1Loading.storesLoaded -
          result.step3_p1Mapping.storesAssigned
        } P1 stores missing`,
        "ERROR"
      );
    }

    const p2Used =
      result.step9_p2NonOptimized.storesAdded +
      result.step10_p2Empty.storesAdded;
    const p3Used =
      result.step14_p3NonOptimized.storesAdded +
      result.step15_p3Empty.storesAdded;

    if (result.step7_p2Loading.storesLoaded > 0) {
      Utils.log(
        `✅ P2 UTILIZATION: ${p2Used}/${
          result.step7_p2Loading.storesLoaded
        } (${((p2Used / result.step7_p2Loading.storesLoaded) * 100).toFixed(
          1
        )}%)`,
        "INFO"
      );
    }

    if (result.step12_p3Loading.storesLoaded > 0) {
      Utils.log(
        `✅ P3 UTILIZATION: ${p3Used}/${
          result.step12_p3Loading.storesLoaded
        } (${((p3Used / result.step12_p3Loading.storesLoaded) * 100).toFixed(
          1
        )}%)`,
        "INFO"
      );
    }

    if (result.step17_finalCheck.timeViolations === 0) {
      Utils.log("✅ TIME COMPLIANCE: All days finish by 6:20 PM", "INFO");
    } else {
      Utils.log(
        `⚠️ TIME VIOLATIONS: ${result.step17_finalCheck.timeViolations} days required trimming`,
        "WARN"
      );
    }

    Utils.log(
      "🎯 ALGORITHM: P1 Areas → P2 Clusters → P3 Clusters → Optimization",
      "INFO"
    );
    Utils.log("=== 17-STEP OPTIMIZATION COMPLETED ===", "INFO");
  }
}

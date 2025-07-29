// ==================== INTELLIGENT DAY OPTIMIZER - AREA-BASED CONSOLIDATION ====================
class IntelligentDayOptimizer {
  static optimizeWorkingDays(workingDays) {
    Utils.log("=== STARTING INTELLIGENT DAY OPTIMIZATION ===", "INFO");

    const optimizationResult = {
      daysOptimized: 0,
      storesMoved: 0,
      p2StoresAdded: 0,
      p3StoresAdded: 0,
      daysCombined: 0,
      areaOptimizations: [],
    };

    // Step 1: Analyze all days and identify optimization needs
    const dayAnalysis = this.analyzeDayOptimization(workingDays);
    Utils.log(
      `📊 Analysis: ${dayAnalysis.underOptimized.length} days need optimization`,
      "INFO"
    );

    // Step 2: Get available filler stores (P2, P3) grouped by area
    const fillerStores = this.getAreaGroupedFillerStores();
    Utils.log(
      `📦 Available filler stores: P2=${fillerStores.P2.length}, P3=${fillerStores.P3.length}`,
      "INFO"
    );

    // Step 3: Process each under-optimized day
    dayAnalysis.underOptimized.forEach((dayData) => {
      const optimizationActions = this.optimizeSingleDay(
        dayData,
        workingDays,
        fillerStores,
        dayAnalysis
      );

      // Merge results
      optimizationResult.daysOptimized++;
      optimizationResult.storesMoved += optimizationActions.storesMoved;
      optimizationResult.p2StoresAdded += optimizationActions.p2StoresAdded;
      optimizationResult.p3StoresAdded += optimizationActions.p3StoresAdded;
      optimizationResult.daysCombined += optimizationActions.daysCombined;
      optimizationResult.areaOptimizations.push(optimizationActions);
    });

    this.logOptimizationSummary(optimizationResult);
    Utils.log("=== INTELLIGENT DAY OPTIMIZATION COMPLETED ===", "INFO");

    return optimizationResult;
  }

  // Step 1: Analyze which days need optimization
  static analyzeDayOptimization(workingDays) {
    const analysis = {
      underOptimized: [],
      optimal: [],
      overloaded: [],
      empty: [],
    };

    const minOptimalStores = CONFIG.CLUSTERING.MIN_STORES_PER_DAY || 6;
    const maxOptimalStores = CONFIG.CLUSTERING.MAX_STORES_PER_DAY || 15;

    let globalDayIndex = 0;

    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        const storeCount = dayInfo.optimizedStores
          ? dayInfo.optimizedStores.length
          : 0;

        const dayData = {
          weekIndex,
          dayIndex,
          globalDayIndex,
          dayInfo,
          storeCount,
          centerPoint: this.calculateDayCenter(dayInfo.optimizedStores),
          averageArea: this.calculateDayArea(dayInfo.optimizedStores),
          storesNeeded: Math.max(0, minOptimalStores - storeCount),
          capacity: maxOptimalStores - storeCount,
        };

        if (storeCount === 0) {
          analysis.empty.push(dayData);
          Utils.log(
            `📅 Empty Day: Week ${weekIndex + 1}, ${dayInfo.dayName}`,
            "INFO"
          );
        } else if (storeCount < minOptimalStores) {
          analysis.underOptimized.push(dayData);
          Utils.log(
            `⚠️ Under-optimized: Week ${weekIndex + 1}, ${
              dayInfo.dayName
            } (${storeCount}/${minOptimalStores} stores)`,
            "WARN"
          );
        } else if (storeCount <= maxOptimalStores) {
          analysis.optimal.push(dayData);
        } else {
          analysis.overloaded.push(dayData);
          Utils.log(
            `❌ Overloaded: Week ${weekIndex + 1}, ${
              dayInfo.dayName
            } (${storeCount}/${maxOptimalStores} stores)`,
            "ERROR"
          );
        }

        globalDayIndex++;
      });
    });

    return analysis;
  }

  // Step 2: Get filler stores grouped by geographic area
  static getAreaGroupedFillerStores() {
    const fillerStores = {
      P2: this.loadFillerStoresByPriority("P2"),
      P3: this.loadFillerStoresByPriority("P3"),
    };

    // Group by geographic clusters
    fillerStores.P2 = this.groupStoresByArea(fillerStores.P2);
    fillerStores.P3 = this.groupStoresByArea(fillerStores.P3);

    return fillerStores;
  }

  // Load filler stores for a specific priority
  static loadFillerStoresByPriority(priority) {
    Utils.log(`🔍 Loading ${priority} filler stores...`, "INFO");

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

      if (!sheet) {
        Utils.log(`❌ Sheet not found for ${priority} store loading`, "ERROR");
        return [];
      }

      const priorityConfig = CONFIG.PRIORITIES[priority];
      if (
        !priorityConfig ||
        priorityConfig.requiredVisits < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY
      ) {
        Utils.log(
          `⚠️ ${priority} priority not configured or frequency too low`,
          "WARN"
        );
        return [];
      }

      const stores = [];
      const col = priorityConfig.startCol;
      const lastRow = sheet.getLastRow();

      for (let row = 4; row <= lastRow; row++) {
        try {
          const shouldVisit = sheet.getRange(row, col + 11).getValue();
          if (shouldVisit !== "YES" && shouldVisit !== true) continue;

          const name = sheet.getRange(row, col + 1).getValue();
          if (!name) continue;

          const noStr = sheet.getRange(row, col).getValue() || "";
          const lat = parseFloat(sheet.getRange(row, col + 6).getValue());
          const lng = parseFloat(sheet.getRange(row, col + 7).getValue());

          if (isNaN(lat) || isNaN(lng)) continue;

          const store = {
            priority: priority,
            noStr: noStr,
            name: name,
            retailer: sheet.getRange(row, col + 2).getValue() || "",
            district: sheet.getRange(row, col + 3).getValue() || "Unknown",
            address: sheet.getRange(row, col + 5).getValue() || "",
            lat: lat,
            lng: lng,
            salesL6M: parseFloat(sheet.getRange(row, col + 8).getValue()) || 0,
            baseFrequency: priorityConfig.requiredVisits,
            actualVisits: 1,
            visits: 1,
            visitTime: CONFIG.DEFAULT_VISIT_TIME,
            isFillerStore: true,
            visitId: `${noStr}_FILLER_${priority}`,
            loadedFromRow: row,
            loadedFromPriority: priority,
          };

          stores.push(store);
        } catch (e) {
          Utils.log(
            `Error loading ${priority} store from row ${row}: ${e}`,
            "ERROR"
          );
          continue;
        }
      }

      Utils.log(`✅ Loaded ${stores.length} ${priority} filler stores`, "INFO");
      return stores;
    } catch (error) {
      Utils.log(`❌ Error loading ${priority} stores: ${error}`, "ERROR");
      return [];
    }
  }

  // Group stores by geographic area using grid clustering
  static groupStoresByArea(stores) {
    if (!stores || stores.length === 0) return [];

    const areaGroups = new Map();
    const gridSize = 0.05; // ~5.5km grid cells

    stores.forEach((store) => {
      const gridX = Math.floor(store.lat / gridSize);
      const gridY = Math.floor(store.lng / gridSize);
      const gridKey = `${gridX}_${gridY}`;

      if (!areaGroups.has(gridKey)) {
        areaGroups.set(gridKey, {
          gridKey,
          stores: [],
          center: null,
          boundingBox: null,
        });
      }

      areaGroups.get(gridKey).stores.push(store);
    });

    // Calculate centers and bounding boxes for each area
    areaGroups.forEach((group) => {
      group.center = this.calculateStoreGroupCenter(group.stores);
      group.boundingBox = this.calculateBoundingBox(group.stores);
    });

    // Convert to array and sort by store count (larger areas first)
    const groupedStores = Array.from(areaGroups.values()).sort(
      (a, b) => b.stores.length - a.stores.length
    );

    Utils.log(
      `📍 Grouped into ${groupedStores.length} geographic areas`,
      "INFO"
    );
    return groupedStores;
  }

  // Step 3: Optimize a single day
  static optimizeSingleDay(dayData, workingDays, fillerStores, allDayAnalysis) {
    Utils.log(
      `🎯 Optimizing Week ${dayData.weekIndex + 1}, ${
        dayData.dayInfo.dayName
      } (${dayData.storeCount} stores)`,
      "INFO"
    );

    const actions = {
      storesMoved: 0,
      p2StoresAdded: 0,
      p3StoresAdded: 0,
      daysCombined: 0,
      optimizationMethods: [],
    };

    const storesNeeded = dayData.storesNeeded;
    let remainingNeed = storesNeeded;

    // Method 1: Try to combine with nearby under-optimized days
    if (remainingNeed > 0) {
      const combineResult = this.tryMergeSimilarAreaDays(
        dayData,
        allDayAnalysis,
        workingDays
      );
      actions.storesMoved += combineResult.storesMoved;
      actions.daysCombined += combineResult.daysCombined;
      remainingNeed -= combineResult.storesMoved;

      if (combineResult.storesMoved > 0) {
        actions.optimizationMethods.push(
          `Combined with ${combineResult.daysCombined} nearby days`
        );
      }
    }

    // Method 2: Add P2 stores from same area
    if (remainingNeed > 0) {
      const p2Result = this.addFillerStoresFromSameArea(
        dayData,
        fillerStores.P2,
        remainingNeed,
        "P2"
      );
      actions.p2StoresAdded += p2Result.storesAdded;
      remainingNeed -= p2Result.storesAdded;

      if (p2Result.storesAdded > 0) {
        actions.optimizationMethods.push(
          `Added ${p2Result.storesAdded} P2 stores from same area`
        );
        this.addStoresToDay(dayData, p2Result.selectedStores, workingDays);
      }
    }

    // Method 3: Add P3 stores from same area if still needed
    if (remainingNeed > 0) {
      const p3Result = this.addFillerStoresFromSameArea(
        dayData,
        fillerStores.P3,
        remainingNeed,
        "P3"
      );
      actions.p3StoresAdded += p3Result.storesAdded;
      remainingNeed -= p3Result.storesAdded;

      if (p3Result.storesAdded > 0) {
        actions.optimizationMethods.push(
          `Added ${p3Result.storesAdded} P3 stores from same area`
        );
        this.addStoresToDay(dayData, p3Result.selectedStores, workingDays);
      }
    }

    // Method 4: Expand search radius for P2/P3 if still needed
    if (remainingNeed > 0) {
      const expandedResult = this.addFillerStoresFromNearbyAreas(
        dayData,
        fillerStores,
        remainingNeed
      );
      actions.p2StoresAdded += expandedResult.p2Added;
      actions.p3StoresAdded += expandedResult.p3Added;

      if (expandedResult.totalAdded > 0) {
        actions.optimizationMethods.push(
          `Added ${expandedResult.totalAdded} stores from nearby areas`
        );
        this.addStoresToDay(
          dayData,
          expandedResult.selectedStores,
          workingDays
        );
      }
    }

    const finalStoreCount =
      dayData.storeCount +
      actions.storesMoved +
      actions.p2StoresAdded +
      actions.p3StoresAdded;
    Utils.log(
      `✅ Day optimization complete: ${dayData.storeCount} → ${finalStoreCount} stores`,
      "INFO"
    );
    actions.optimizationMethods.forEach((method) => {
      Utils.log(`   📋 ${method}`, "INFO");
    });

    return actions;
  }

  // Method 1: Try to merge with nearby under-optimized days
  static tryMergeSimilarAreaDays(targetDay, allDayAnalysis, workingDays) {
    const result = {
      storesMoved: 0,
      daysCombined: 0,
    };

    if (!targetDay.centerPoint) return result;

    const maxMergeDistance = 10; // 10km radius for merging
    const candidateDays = allDayAnalysis.underOptimized.filter(
      (day) =>
        day.globalDayIndex !== targetDay.globalDayIndex &&
        day.centerPoint &&
        Utils.distance(
          targetDay.centerPoint.lat,
          targetDay.centerPoint.lng,
          day.centerPoint.lat,
          day.centerPoint.lng
        ) <= maxMergeDistance
    );

    candidateDays.forEach((candidateDay) => {
      const availableCapacity = targetDay.capacity - result.storesMoved;
      if (availableCapacity <= 0) return;

      const storesToMove = Math.min(candidateDay.storeCount, availableCapacity);

      if (storesToMove > 0) {
        // Move stores from candidate day to target day
        const candidateWeek = workingDays[candidateDay.weekIndex];
        const candidateDayInfo = candidateWeek[candidateDay.dayIndex];
        const storesToTransfer = candidateDayInfo.optimizedStores.splice(
          0,
          storesToMove
        );

        const targetWeek = workingDays[targetDay.weekIndex];
        const targetDayInfo = targetWeek[targetDay.dayIndex];

        if (!targetDayInfo.optimizedStores) {
          targetDayInfo.optimizedStores = [];
        }

        targetDayInfo.optimizedStores.push(...storesToTransfer);

        result.storesMoved += storesToMove;
        result.daysCombined++;

        Utils.log(
          `🔗 Merged ${storesToMove} stores from Week ${
            candidateDay.weekIndex + 1
          }, ${candidateDay.dayInfo.dayName}`,
          "INFO"
        );
      }
    });

    return result;
  }

  // Method 2 & 3: Add filler stores from same area
  static addFillerStoresFromSameArea(
    dayData,
    fillerStoreAreas,
    maxStores,
    priority
  ) {
    const result = {
      storesAdded: 0,
      selectedStores: [],
    };

    if (!dayData.centerPoint || !fillerStoreAreas.length) return result;

    const maxAreaDistance = 8; // 8km radius for same area

    // Find filler store areas near this day
    const compatibleAreas = fillerStoreAreas.filter((area) => {
      const distance = Utils.distance(
        dayData.centerPoint.lat,
        dayData.centerPoint.lng,
        area.center.lat,
        area.center.lng
      );
      return distance <= maxAreaDistance;
    });

    // Sort by proximity
    compatibleAreas.sort((a, b) => {
      const distA = Utils.distance(
        dayData.centerPoint.lat,
        dayData.centerPoint.lng,
        a.center.lat,
        a.center.lng
      );
      const distB = Utils.distance(
        dayData.centerPoint.lat,
        dayData.centerPoint.lng,
        b.center.lat,
        b.center.lng
      );
      return distA - distB;
    });

    // Select stores from compatible areas
    let remainingNeed = maxStores;

    compatibleAreas.forEach((area) => {
      if (remainingNeed <= 0) return;

      const availableStores = area.stores.filter((store) => !store.isUsed);
      const storesToTake = Math.min(remainingNeed, availableStores.length);

      if (storesToTake > 0) {
        // Select best stores from this area (by sales volume)
        const selectedFromArea = availableStores
          .sort((a, b) => (b.salesL6M || 0) - (a.salesL6M || 0))
          .slice(0, storesToTake);

        // Mark as used
        selectedFromArea.forEach((store) => (store.isUsed = true));

        result.selectedStores.push(...selectedFromArea);
        result.storesAdded += selectedFromArea.length;
        remainingNeed -= selectedFromArea.length;

        Utils.log(
          `📦 Selected ${selectedFromArea.length} ${priority} stores from area ${area.gridKey}`,
          "INFO"
        );
      }
    });

    return result;
  }

  // Method 4: Expand search for nearby areas
  static addFillerStoresFromNearbyAreas(dayData, fillerStores, maxStores) {
    const result = {
      p2Added: 0,
      p3Added: 0,
      totalAdded: 0,
      selectedStores: [],
    };

    if (!dayData.centerPoint) return result;

    const expandedRadius = 15; // 15km expanded radius
    let remainingNeed = maxStores;

    // Try P2 stores first
    if (remainingNeed > 0) {
      const p2Result = this.findStoresInExpandedRadius(
        dayData,
        fillerStores.P2,
        remainingNeed,
        expandedRadius,
        "P2"
      );
      result.p2Added = p2Result.storesAdded;
      result.selectedStores.push(...p2Result.selectedStores);
      remainingNeed -= p2Result.storesAdded;
    }

    // Try P3 stores if still needed
    if (remainingNeed > 0) {
      const p3Result = this.findStoresInExpandedRadius(
        dayData,
        fillerStores.P3,
        remainingNeed,
        expandedRadius,
        "P3"
      );
      result.p3Added = p3Result.storesAdded;
      result.selectedStores.push(...p3Result.selectedStores);
      remainingNeed -= p3Result.storesAdded;
    }

    result.totalAdded = result.p2Added + result.p3Added;
    return result;
  }

  // Helper: Find stores in expanded radius
  static findStoresInExpandedRadius(
    dayData,
    fillerStoreAreas,
    maxStores,
    radius,
    priority
  ) {
    const result = {
      storesAdded: 0,
      selectedStores: [],
    };

    const allStoresInRadius = [];

    fillerStoreAreas.forEach((area) => {
      const distance = Utils.distance(
        dayData.centerPoint.lat,
        dayData.centerPoint.lng,
        area.center.lat,
        area.center.lng
      );

      if (distance <= radius) {
        const availableStores = area.stores.filter((store) => !store.isUsed);
        availableStores.forEach((store) => {
          allStoresInRadius.push({
            ...store,
            distanceFromDay: distance,
          });
        });
      }
    });

    // Sort by distance and sales volume
    allStoresInRadius.sort((a, b) => {
      const distanceScore = a.distanceFromDay - b.distanceFromDay;
      const salesScore = (b.salesL6M || 0) - (a.salesL6M || 0);
      return distanceScore * 0.7 + salesScore * 0.3; // Prioritize distance
    });

    // Select best stores
    const selectedStores = allStoresInRadius.slice(0, maxStores);
    selectedStores.forEach((store) => (store.isUsed = true));

    result.selectedStores = selectedStores;
    result.storesAdded = selectedStores.length;

    if (selectedStores.length > 0) {
      Utils.log(
        `🎯 Found ${selectedStores.length} ${priority} stores in expanded radius`,
        "INFO"
      );
    }

    return result;
  }

  // Helper: Add stores to day with proper routing
  static addStoresToDay(dayData, newStores, workingDays) {
    if (!newStores || newStores.length === 0) return;

    const week = workingDays[dayData.weekIndex];
    const dayInfo = week[dayData.dayIndex];

    if (!dayInfo.optimizedStores) {
      dayInfo.optimizedStores = [];
    }

    // Create detailed route entries for new stores
    const detailedStores = this.createDetailedRoute(
      newStores,
      dayInfo,
      dayInfo.optimizedStores.length
    );
    dayInfo.optimizedStores.push(...detailedStores);

    // Re-optimize the entire day route
    dayInfo.optimizedStores = this.optimizeDayRoute(dayInfo.optimizedStores);
  }

  // Helper: Create detailed route for added stores
  static createDetailedRoute(stores, dayInfo, startOrder = 0) {
    if (!stores || stores.length === 0) return [];

    const route = [];
    let currentTime = CONFIG.WORK.START;
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;

    // If there are existing stores, start from the last store
    if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
      const lastStore =
        dayInfo.optimizedStores[dayInfo.optimizedStores.length - 1];
      currentTime = lastStore.departTime || currentTime;
      currentLat = lastStore.lat;
      currentLng = lastStore.lng;
    }

    const isFriday = dayInfo.isFriday || false;
    const breakStart = isFriday
      ? CONFIG.FRIDAY_PRAYER.START
      : CONFIG.LUNCH.START;
    const breakEnd = isFriday ? CONFIG.FRIDAY_PRAYER.END : CONFIG.LUNCH.END;
    let hasBreak = currentTime > breakEnd;

    stores.forEach((store, index) => {
      const distance = Utils.distance(
        currentLat,
        currentLng,
        store.lat,
        store.lng
      );
      const travelTime = Math.round(distance * 3); // 3 min per km

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
        order: startOrder + index + 1,
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

  // Helper: Optimize day route using nearest neighbor
  static optimizeDayRoute(stores) {
    if (!stores || stores.length <= 2) return stores;

    // Simple nearest neighbor optimization
    const optimized = [];
    const remaining = [...stores];
    let current = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let minDistance = Infinity;

      remaining.forEach((store, index) => {
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

      const nearest = remaining.splice(nearestIndex, 1)[0];
      optimized.push(nearest);
      current = nearest;
    }

    // Update order numbers
    optimized.forEach((store, index) => {
      store.order = index + 1;
    });

    return optimized;
  }

  // Helper functions for calculations
  static calculateDayCenter(stores) {
    if (!stores || stores.length === 0) return null;

    const lat =
      stores.reduce((sum, store) => sum + store.lat, 0) / stores.length;
    const lng =
      stores.reduce((sum, store) => sum + store.lng, 0) / stores.length;

    return { lat, lng };
  }

  static calculateDayArea(stores) {
    if (!stores || stores.length === 0) return 0;

    const center = this.calculateDayCenter(stores);
    const distances = stores.map((store) =>
      Utils.distance(center.lat, center.lng, store.lat, store.lng)
    );

    return Math.max(...distances);
  }

  static calculateStoreGroupCenter(stores) {
    if (!stores || stores.length === 0) return null;

    const lat =
      stores.reduce((sum, store) => sum + store.lat, 0) / stores.length;
    const lng =
      stores.reduce((sum, store) => sum + store.lng, 0) / stores.length;

    return { lat, lng };
  }

  static calculateBoundingBox(stores) {
    if (!stores || stores.length === 0) return null;

    const lats = stores.map((s) => s.lat);
    const lngs = stores.map((s) => s.lng);

    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    };
  }

  // Logging
  static logOptimizationSummary(result) {
    Utils.log("", "INFO");
    Utils.log("🎯 INTELLIGENT DAY OPTIMIZATION SUMMARY:", "INFO");
    Utils.log("==========================================", "INFO");
    Utils.log(`Days optimized: ${result.daysOptimized}`, "INFO");
    Utils.log(`Stores moved from other days: ${result.storesMoved}`, "INFO");
    Utils.log(`P2 stores added: ${result.p2StoresAdded}`, "INFO");
    Utils.log(`P3 stores added: ${result.p3StoresAdded}`, "INFO");
    Utils.log(`Days combined: ${result.daysCombined}`, "INFO");
    Utils.log("", "INFO");

    if (result.areaOptimizations.length > 0) {
      Utils.log("📋 OPTIMIZATION DETAILS:", "INFO");
      result.areaOptimizations.forEach((action, index) => {
        Utils.log(`Day ${index + 1} optimizations:`, "INFO");
        action.optimizationMethods.forEach((method) => {
          Utils.log(`  • ${method}`, "INFO");
        });
      });
    }

    Utils.log("=== INTELLIGENT OPTIMIZATION COMPLETED ===", "INFO");
  }
}

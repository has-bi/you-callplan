// ==================== LAYERED PRIORITY OPTIMIZER - YOUR ALGORITHM ====================
class LayeredPriorityOptimizer {
  static optimizeWorkingDays(workingDays) {
    Utils.log("=== STARTING LAYERED PRIORITY OPTIMIZATION ===", "INFO");

    const optimizationResult = {
      phase1_p1: { daysCreated: 0, storesPlaced: 0, duplicatesRemoved: 0 },
      phase2_p2: {
        daysOptimized: 0,
        storesAdded: 0,
        duplicatesRemoved: 0,
        daysCombined: 0,
      },
      phase3_p3: {
        daysOptimized: 0,
        storesAdded: 0,
        duplicatesRemoved: 0,
        daysCombined: 0,
      },
      phase4_final: { timeViolations: 0, storesRemoved: 0, finalDaysCount: 0 },
    };

    // STEP 1: Map P1 stores by area and remove duplicates
    Utils.log("🎯 PHASE 1: Processing P1 stores by area", "INFO");
    const p1Result = this.processP1StoresByArea(workingDays);
    optimizationResult.phase1_p1 = p1Result;

    // STEP 2: Combine days if stores < 7 (after P1)
    Utils.log("🔗 PHASE 1B: Combining P1 days with < 7 stores", "INFO");
    const p1CombineResult = this.combineDaysByGeographicProximity(
      workingDays,
      "P1"
    );
    optimizationResult.phase1_p1.daysCombined = p1CombineResult.daysCombined;

    // STEP 3: Create initial day analysis with time tracking
    Utils.log("⏰ PHASE 2A: Analyzing day capacity and timing", "INFO");
    const dayAnalysis = this.analyzeDayCapacityAndTiming(workingDays);

    // STEP 4: Process P2 stores
    Utils.log("🎯 PHASE 2: Processing P2 stores by area", "INFO");
    const p2Result = this.processP2StoresByArea(workingDays, dayAnalysis);
    optimizationResult.phase2_p2 = p2Result;

    // STEP 5: Remove duplicates and combine days after P2
    Utils.log("🧹 PHASE 2B: P2 deduplication and combining", "INFO");
    const p2DedupeResult = this.deduplicateAndCombine(workingDays, "P2");
    optimizationResult.phase2_p2.duplicatesRemoved =
      p2DedupeResult.duplicatesRemoved;
    optimizationResult.phase2_p2.daysCombined += p2DedupeResult.daysCombined;

    // STEP 6: Process P3 stores
    Utils.log("🎯 PHASE 3: Processing P3 stores by area", "INFO");
    const p3Result = this.processP3StoresByArea(workingDays, dayAnalysis);
    optimizationResult.phase3_p3 = p3Result;

    // STEP 7: Remove duplicates and combine days after P3
    Utils.log("🧹 PHASE 3B: P3 deduplication and combining", "INFO");
    const p3DedupeResult = this.deduplicateAndCombine(workingDays, "P3");
    optimizationResult.phase3_p3.duplicatesRemoved =
      p3DedupeResult.duplicatesRemoved;
    optimizationResult.phase3_p3.daysCombined += p3DedupeResult.daysCombined;

    // STEP 8: Final time validation and trimming
    Utils.log("⏰ PHASE 4: Final time validation and trimming", "INFO");
    const finalResult = this.finalTimeValidationAndTrimming(workingDays);
    optimizationResult.phase4_final = finalResult;

    this.logOptimizationSummary(optimizationResult);
    Utils.log("=== LAYERED PRIORITY OPTIMIZATION COMPLETED ===", "INFO");

    return optimizationResult;
  }

  // STEP 1: Map P1 stores by area and remove duplicates
  static processP1StoresByArea(workingDays) {
    Utils.log(
      "📍 Processing P1 stores by area - ALL STORES MUST BE INCLUDED...",
      "INFO"
    );

    const result = {
      daysCreated: 0,
      storesPlaced: 0,
      duplicatesRemoved: 0,
      totalP1Required: 0,
      p1NotScheduled: 0,
    };

    // ✅ CRITICAL: Load ALL P1 stores from sheet, not just current schedule
    const allP1Stores = this.loadAllP1StoresFromSheet();
    result.totalP1Required = allP1Stores.length;
    Utils.log(
      `🎯 LOADING ALL P1 STORES: ${allP1Stores.length} total P1 stores found`,
      "INFO"
    );

    // Remove duplicates
    const uniqueP1Stores = this.removeDuplicateStores(allP1Stores, "P1");
    result.duplicatesRemoved = allP1Stores.length - uniqueP1Stores.length;

    if (result.duplicatesRemoved > 0) {
      Utils.log(`Removed ${result.duplicatesRemoved} P1 duplicates`, "WARN");
    }

    // Group by area
    const p1AreaGroups = this.groupStoresByArea(uniqueP1Stores, "P1");
    Utils.log(`Grouped P1 stores into ${p1AreaGroups.length} areas`, "INFO");

    // Clear existing working days and rebuild with P1 foundation
    this.clearWorkingDays(workingDays);

    // ✅ CRITICAL: FORCE ALL P1 STORES TO BE SCHEDULED
    let dayIndex = 0;
    let unscheduledP1Stores = [];

    p1AreaGroups.forEach((areaGroup, groupIndex) => {
      let remainingStores = [...areaGroup.stores];

      while (remainingStores.length > 0) {
        if (dayIndex >= this.getTotalAvailableDays(workingDays)) {
          // ❌ RAN OUT OF DAYS - This is critical!
          unscheduledP1Stores.push(...remainingStores);
          Utils.log(
            `❌ CRITICAL: Ran out of days! ${remainingStores.length} P1 stores cannot be scheduled`,
            "ERROR"
          );
          break;
        }

        const targetDay = this.findDayByIndex(workingDays, dayIndex);
        if (!targetDay) {
          unscheduledP1Stores.push(...remainingStores);
          break;
        }

        if (!targetDay.optimizedStores) {
          targetDay.optimizedStores = [];
        }

        // Calculate how many stores can fit in this day (time constraint)
        const maxStoresForDay = this.calculateMaxStoresForDay(targetDay);
        const storesToAssign = Math.min(
          remainingStores.length,
          maxStoresForDay
        );

        if (storesToAssign > 0) {
          const selectedStores = remainingStores.splice(0, storesToAssign);

          // Add stores with basic routing
          const routedStores = this.createBasicRoute(selectedStores, targetDay);
          targetDay.optimizedStores.push(...routedStores);

          result.storesPlaced += selectedStores.length;

          Utils.log(
            `Assigned ${selectedStores.length} P1 stores from Area ${
              groupIndex + 1
            } to day ${dayIndex + 1}`,
            "INFO"
          );
        }

        dayIndex++;
        if (dayIndex === 0) result.daysCreated++; // Track unique days used
      }
    });

    // ✅ CRITICAL: Report if any P1 stores couldn't be scheduled
    result.p1NotScheduled = unscheduledP1Stores.length;
    if (result.p1NotScheduled > 0) {
      Utils.log(
        `❌ CRITICAL WARNING: ${result.p1NotScheduled} P1 stores could not be scheduled!`,
        "ERROR"
      );
      Utils.log(
        "Consider: 1) Increasing working days, 2) Reducing visit times, 3) Optimizing routes",
        "ERROR"
      );
    } else {
      Utils.log(
        `✅ SUCCESS: All ${result.totalP1Required} P1 stores have been scheduled`,
        "INFO"
      );
    }

    return result;
  }

  // ✅ NEW: Load ALL P1 stores directly from sheet
  static loadAllP1StoresFromSheet() {
    Utils.log("📋 Loading ALL P1 stores from sheet...", "INFO");

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

      if (!sheet) {
        Utils.log("❌ Sheet not found for P1 loading", "ERROR");
        return [];
      }

      const p1Config = CONFIG.PRIORITIES.P1;
      if (!p1Config) {
        Utils.log("❌ P1 configuration not found", "ERROR");
        return [];
      }

      const allP1Stores = [];
      const col = p1Config.startCol;
      const lastRow = sheet.getLastRow();

      for (let row = 4; row <= lastRow; row++) {
        try {
          // ✅ IMPORTANT: For P1, we check shouldVisit = "YES"
          const shouldVisit = sheet.getRange(row, col + 11).getValue();
          if (shouldVisit !== "YES" && shouldVisit !== true) continue;

          const name = sheet.getRange(row, col + 1).getValue();
          if (!name) continue;

          const noStr = sheet.getRange(row, col).getValue() || "";
          const lat = parseFloat(sheet.getRange(row, col + 6).getValue());
          const lng = parseFloat(sheet.getRange(row, col + 7).getValue());

          if (isNaN(lat) || isNaN(lng)) continue;

          // Calculate actual visits for P1 (respecting frequency)
          const actualVisits = Utils.calculateActualVisits(
            p1Config.requiredVisits,
            1,
            row - 4, // Use row as store index
            "P1"
          );

          if (actualVisits > 0) {
            const store = {
              priority: "P1",
              noStr: noStr,
              name: name,
              retailer: sheet.getRange(row, col + 2).getValue() || "",
              district: sheet.getRange(row, col + 3).getValue() || "Unknown",
              address: sheet.getRange(row, col + 5).getValue() || "",
              lat: lat,
              lng: lng,
              salesL6M:
                parseFloat(sheet.getRange(row, col + 8).getValue()) || 0,
              baseFrequency: p1Config.requiredVisits,
              actualVisits: actualVisits,
              visits: actualVisits,
              visitTime: CONFIG.DEFAULT_VISIT_TIME,
              visitId: `${noStr}_P1`,
              loadedFromRow: row,
              loadedFromPriority: "P1",
              isP1Store: true, // Mark as P1 for priority handling
            };

            allP1Stores.push(store);
          }
        } catch (e) {
          Utils.log(`Error loading P1 store from row ${row}: ${e}`, "ERROR");
          continue;
        }
      }

      Utils.log(`✅ Loaded ${allP1Stores.length} P1 stores from sheet`, "INFO");
      return allP1Stores;
    } catch (error) {
      Utils.log(`❌ Error loading P1 stores: ${error}`, "ERROR");
      return [];
    }
  }

  // ✅ NEW: Calculate max stores that can fit in a day (time constraint)
  static calculateMaxStoresForDay(dayInfo) {
    const isFriday = dayInfo.isFriday || false;
    const breakDuration = isFriday
      ? CONFIG.FRIDAY_PRAYER.END - CONFIG.FRIDAY_PRAYER.START
      : CONFIG.LUNCH.END - CONFIG.LUNCH.START;

    const availableWorkTime =
      CONFIG.WORK.END - CONFIG.WORK.START - breakDuration;
    const avgTimePerStore = 45; // 30min visit + 15min travel/buffer

    const maxStores = Math.floor(availableWorkTime / avgTimePerStore);

    // Ensure we don't exceed configured limits
    return Math.min(maxStores, CONFIG.CLUSTERING.MAX_STORES_PER_DAY || 15);
  }

  // STEP 2: Combine days if < 7 stores (geographic proximity)
  static combineDaysByGeographicProximity(workingDays, phase) {
    Utils.log(`🔗 Combining days with < 7 stores (${phase} phase)...`, "INFO");

    const result = {
      daysCombined: 0,
    };

    const minViableStores = 7;
    const maxCombineDistance = 15; // km

    // Find days with < 7 stores
    const underOptimizedDays = this.findUnderOptimizedDays(
      workingDays,
      minViableStores
    );
    Utils.log(
      `Found ${underOptimizedDays.length} days with < ${minViableStores} stores`,
      "INFO"
    );

    // Try to combine nearby under-optimized days
    const processed = new Set();

    underOptimizedDays.forEach((day1) => {
      if (processed.has(day1.globalIndex)) return;

      const day1Center = this.calculateDayCenter(day1.dayInfo.optimizedStores);
      if (!day1Center) return;

      // Find another day to combine with
      for (const day2 of underOptimizedDays) {
        if (
          processed.has(day2.globalIndex) ||
          day1.globalIndex === day2.globalIndex
        )
          continue;

        const day2Center = this.calculateDayCenter(
          day2.dayInfo.optimizedStores
        );
        if (!day2Center) continue;

        const distance = Utils.distance(
          day1Center.lat,
          day1Center.lng,
          day2Center.lat,
          day2Center.lng
        );

        const combinedStores = day1.storeCount + day2.storeCount;
        const estimatedEndTime = this.estimateEndTime(combinedStores);

        // Check if combining is viable
        if (
          distance <= maxCombineDistance &&
          combinedStores <= CONFIG.CLUSTERING.MAX_STORES_PER_DAY &&
          estimatedEndTime <= CONFIG.WORK.END
        ) {
          // Combine day2 into day1
          const storesToMove = day2.dayInfo.optimizedStores || [];
          day1.dayInfo.optimizedStores.push(...storesToMove);
          day2.dayInfo.optimizedStores = [];

          // Re-optimize the combined route
          day1.dayInfo.optimizedStores = this.optimizeDayRoute(
            day1.dayInfo.optimizedStores
          );

          processed.add(day1.globalIndex);
          processed.add(day2.globalIndex);
          result.daysCombined++;

          Utils.log(
            `Combined day ${day2.globalIndex + 1} into day ${
              day1.globalIndex + 1
            } (${combinedStores} stores total)`,
            "INFO"
          );
          break;
        }
      }
    });

    return result;
  }

  // STEP 3: Analyze day capacity and timing
  static analyzeDayCapacityAndTiming(workingDays) {
    Utils.log("⏰ Analyzing day capacity and timing...", "INFO");

    const analysis = [];
    let globalIndex = 0;

    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        const currentStores = dayInfo.optimizedStores
          ? dayInfo.optimizedStores.length
          : 0;
        const estimatedEndTime = this.estimateEndTime(currentStores);
        const timeCapacity = this.calculateTimeCapacity(estimatedEndTime);
        const storeCapacity =
          CONFIG.CLUSTERING.MAX_STORES_PER_DAY - currentStores;

        const dayData = {
          weekIndex,
          dayIndex,
          globalIndex,
          dayInfo,
          currentStores,
          estimatedEndTime,
          timeCapacity, // How many more stores can fit time-wise
          storeCapacity, // How many more stores can fit count-wise
          availableCapacity: Math.min(timeCapacity, storeCapacity),
          center: this.calculateDayCenter(dayInfo.optimizedStores),
          canAcceptStores: timeCapacity > 0 && storeCapacity > 0,
        };

        analysis.push(dayData);

        Utils.log(
          `Day ${globalIndex + 1}: ${currentStores} stores, capacity: ${
            dayData.availableCapacity
          }, end time: ${Utils.formatTime(estimatedEndTime)}`,
          "INFO"
        );
        globalIndex++;
      });
    });

    return analysis;
  }

  // STEP 4: Process P2 stores by area
  static processP2StoresByArea(workingDays, dayAnalysis) {
    Utils.log("📍 Processing P2 stores by area...", "INFO");

    const result = {
      daysOptimized: 0,
      storesAdded: 0,
    };

    // Get available P2 stores
    const p2Stores = this.loadStoresByPriority("P2");
    if (p2Stores.length === 0) {
      Utils.log("No P2 stores available", "INFO");
      return result;
    }

    // Group P2 stores by area
    const p2AreaGroups = this.groupStoresByArea(p2Stores, "P2");
    Utils.log(`Grouped P2 stores into ${p2AreaGroups.length} areas`, "INFO");

    // Find days that need stores (< 7) or have capacity
    const targetDays = dayAnalysis.filter(
      (day) =>
        day.currentStores < 7 ||
        (day.canAcceptStores && day.availableCapacity > 0)
    );

    Utils.log(
      `Found ${targetDays.length} days that can accept P2 stores`,
      "INFO"
    );

    // Match P2 areas to compatible days
    p2AreaGroups.forEach((areaGroup) => {
      // Find best compatible day for this P2 area
      const compatibleDays = this.findCompatibleDays(areaGroup, targetDays);

      compatibleDays.forEach((compatibleDay) => {
        if (areaGroup.stores.length === 0) return; // All stores used

        const storesToAdd = Math.min(
          areaGroup.stores.length,
          compatibleDay.availableCapacity,
          this.calculateMaxStoresForTimeCapacity(compatibleDay.timeCapacity)
        );

        if (storesToAdd > 0) {
          const selectedStores = areaGroup.stores.splice(0, storesToAdd);

          // Add to day with routing
          const routedStores = this.createBasicRoute(
            selectedStores,
            compatibleDay.dayInfo,
            compatibleDay.currentStores
          );
          compatibleDay.dayInfo.optimizedStores.push(...routedStores);

          // Update day analysis
          compatibleDay.currentStores += storesToAdd;
          compatibleDay.estimatedEndTime = this.estimateEndTime(
            compatibleDay.currentStores
          );
          compatibleDay.availableCapacity -= storesToAdd;

          result.storesAdded += storesToAdd;
          if (compatibleDay.currentStores >= 7) {
            result.daysOptimized++;
          }

          Utils.log(
            `Added ${storesToAdd} P2 stores to day ${
              compatibleDay.globalIndex + 1
            }`,
            "INFO"
          );
        }
      });
    });

    return result;
  }

  // STEP 6: Process P3 stores by area (similar to P2)
  static processP3StoresByArea(workingDays, dayAnalysis) {
    Utils.log("📍 Processing P3 stores by area...", "INFO");

    const result = {
      daysOptimized: 0,
      storesAdded: 0,
    };

    // Get available P3 stores
    const p3Stores = this.loadStoresByPriority("P3");
    if (p3Stores.length === 0) {
      Utils.log("No P3 stores available", "INFO");
      return result;
    }

    // Refresh day analysis for current state
    const updatedDayAnalysis = this.analyzeDayCapacityAndTiming(workingDays);

    // Group P3 stores by area
    const p3AreaGroups = this.groupStoresByArea(p3Stores, "P3");
    Utils.log(`Grouped P3 stores into ${p3AreaGroups.length} areas`, "INFO");

    // Find days that still need stores (< 7) or have capacity
    const targetDays = updatedDayAnalysis.filter(
      (day) =>
        day.currentStores < 7 ||
        (day.canAcceptStores && day.availableCapacity > 0)
    );

    Utils.log(
      `Found ${targetDays.length} days that can accept P3 stores`,
      "INFO"
    );

    // Match P3 areas to compatible days
    p3AreaGroups.forEach((areaGroup) => {
      const compatibleDays = this.findCompatibleDays(areaGroup, targetDays);

      compatibleDays.forEach((compatibleDay) => {
        if (areaGroup.stores.length === 0) return;

        const storesToAdd = Math.min(
          areaGroup.stores.length,
          compatibleDay.availableCapacity,
          this.calculateMaxStoresForTimeCapacity(compatibleDay.timeCapacity)
        );

        if (storesToAdd > 0) {
          const selectedStores = areaGroup.stores.splice(0, storesToAdd);

          const routedStores = this.createBasicRoute(
            selectedStores,
            compatibleDay.dayInfo,
            compatibleDay.currentStores
          );
          compatibleDay.dayInfo.optimizedStores.push(...routedStores);

          compatibleDay.currentStores += storesToAdd;
          compatibleDay.estimatedEndTime = this.estimateEndTime(
            compatibleDay.currentStores
          );
          compatibleDay.availableCapacity -= storesToAdd;

          result.storesAdded += storesToAdd;
          if (compatibleDay.currentStores >= 7) {
            result.daysOptimized++;
          }

          Utils.log(
            `Added ${storesToAdd} P3 stores to day ${
              compatibleDay.globalIndex + 1
            }`,
            "INFO"
          );
        }
      });
    });

    return result;
  }

  // STEP 5 & 7: Remove duplicates and combine days
  static deduplicateAndCombine(workingDays, phase) {
    Utils.log(`🧹 ${phase} deduplication and combining...`, "INFO");

    const result = {
      duplicatesRemoved: 0,
      daysCombined: 0,
    };

    // Remove duplicates across all days
    const duplicateResult = this.removeDuplicatesAcrossDays(workingDays);
    result.duplicatesRemoved = duplicateResult.duplicatesRemoved;

    // Combine days if < 7 stores
    const combineResult = this.combineDaysByGeographicProximity(
      workingDays,
      phase
    );
    result.daysCombined = combineResult.daysCombined;

    return result;
  }

  // STEP 8: Final time validation and trimming
  static finalTimeValidationAndTrimming(workingDays) {
    Utils.log("⏰ Final time validation and trimming...", "INFO");

    const result = {
      timeViolations: 0,
      storesRemoved: 0,
      finalDaysCount: 0,
    };

    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        if (!dayInfo.optimizedStores || dayInfo.optimizedStores.length === 0)
          return;

        result.finalDaysCount++;

        // Calculate detailed timing for this day
        const detailedRoute = this.createDetailedRoute(
          dayInfo.optimizedStores,
          dayInfo
        );
        const finalEndTime =
          detailedRoute.length > 0
            ? detailedRoute[detailedRoute.length - 1].departTime
            : CONFIG.WORK.START;

        if (finalEndTime > CONFIG.WORK.END) {
          result.timeViolations++;

          // Trim stores that cause time violation
          const trimmedRoute = this.trimStoresForTimeConstraint(
            detailedRoute,
            dayInfo
          );
          const removedStores = detailedRoute.length - trimmedRoute.length;

          dayInfo.optimizedStores = trimmedRoute;
          result.storesRemoved += removedStores;

          Utils.log(
            `⚠️ Time violation in Week ${weekIndex + 1}, ${
              dayInfo.dayName
            }: removed ${removedStores} stores`,
            "WARN"
          );
        } else {
          // Update with detailed route
          dayInfo.optimizedStores = detailedRoute;
        }
      });
    });

    Utils.log(
      `Final validation complete: ${result.timeViolations} violations, ${result.storesRemoved} stores removed`,
      "INFO"
    );
    return result;
  }

  // Helper Functions
  static collectStoresByPriority(workingDays, priority) {
    const stores = [];
    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores) {
          const priorityStores = dayInfo.optimizedStores.filter(
            (store) => store.priority === priority
          );
          stores.push(...priorityStores);
        }
      });
    });
    return stores;
  }

  static removeDuplicateStores(stores, phase) {
    const unique = new Map();
    const duplicates = [];

    stores.forEach((store) => {
      const key = store.noStr || store.name;
      if (unique.has(key)) {
        duplicates.push(store);
      } else {
        unique.set(key, store);
      }
    });

    if (duplicates.length > 0) {
      Utils.log(`${phase}: Removed ${duplicates.length} duplicates`, "WARN");
    }

    return Array.from(unique.values());
  }

  static groupStoresByArea(stores, priority) {
    const gridSize = 0.05; // ~5.5km
    const areaGroups = new Map();

    stores.forEach((store) => {
      const gridX = Math.floor(store.lat / gridSize);
      const gridY = Math.floor(store.lng / gridSize);
      const gridKey = `${gridX}_${gridY}`;

      if (!areaGroups.has(gridKey)) {
        areaGroups.set(gridKey, {
          gridKey,
          stores: [],
          center: null,
          priority,
        });
      }

      areaGroups.get(gridKey).stores.push(store);
    });

    // Calculate centers
    areaGroups.forEach((group) => {
      group.center = this.calculateStoreGroupCenter(group.stores);
    });

    const groups = Array.from(areaGroups.values()).sort(
      (a, b) => b.stores.length - a.stores.length
    );
    Utils.log(`${priority}: Created ${groups.length} area groups`, "INFO");

    return groups;
  }

  static estimateEndTime(storeCount) {
    if (storeCount === 0) return CONFIG.WORK.START;

    const avgTimePerStore = 45; // 30min visit + 15min travel/buffer
    const breakTime = 60; // Lunch or prayer break
    const estimatedWorkTime = storeCount * avgTimePerStore + breakTime;

    return CONFIG.WORK.START + estimatedWorkTime;
  }

  static calculateTimeCapacity(currentEndTime) {
    if (currentEndTime >= CONFIG.WORK.END) return 0;

    const remainingTime = CONFIG.WORK.END - currentEndTime;
    const avgTimePerStore = 45;

    return Math.floor(remainingTime / avgTimePerStore);
  }

  static calculateMaxStoresForTimeCapacity(timeCapacity) {
    return Math.max(0, timeCapacity);
  }

  static findCompatibleDays(areaGroup, targetDays) {
    if (!areaGroup.center) return [];

    const maxDistance = 20; // Allow cross-area within 20km

    return targetDays
      .filter((day) => day.availableCapacity > 0)
      .map((day) => ({
        ...day,
        distance: day.center
          ? Utils.distance(
              areaGroup.center.lat,
              areaGroup.center.lng,
              day.center.lat,
              day.center.lng
            )
          : Infinity,
        priority: day.currentStores < 7 ? 1 : 2, // Prioritize days with < 7 stores
      }))
      .filter((day) => day.distance <= maxDistance)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.distance - b.distance;
      });
  }

  static loadStoresByPriority(priority) {
    // ❓ CLARIFICATION NEEDED: Where do P3 stores come from?
    Utils.log(`🔍 Loading ${priority} stores from sheet...`, "INFO");

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

      if (!sheet) {
        Utils.log(`❌ Sheet not found for ${priority} loading`, "ERROR");
        return [];
      }

      const priorityConfig = CONFIG.PRIORITIES[priority];
      if (!priorityConfig) {
        Utils.log(
          `❌ ${priority} configuration not found in CONFIG.PRIORITIES`,
          "ERROR"
        );
        Utils.log(
          `Available priorities: ${Object.keys(CONFIG.PRIORITIES).join(", ")}`,
          "INFO"
        );
        return [];
      }

      // ⚠️ IMPORTANT: Check if this priority has valid configuration
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
      const col = priorityConfig.startCol;
      const lastRow = sheet.getLastRow();

      Utils.log(
        `📊 ${priority} Config: Column ${col}, Frequency ${priorityConfig.requiredVisits}`,
        "INFO"
      );

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
            visitId: `${noStr}_${priority}_FILLER`,
            loadedFromRow: row,
            loadedFromPriority: priority,
          };

          stores.push(store);
        } catch (e) {
          continue;
        }
      }

      Utils.log(`✅ Loaded ${stores.length} ${priority} stores`, "INFO");

      // ❓ DEBUG: Log first few stores to verify data
      if (stores.length > 0) {
        Utils.log(`📋 ${priority} Sample stores:`, "INFO");
        stores.slice(0, 3).forEach((store, idx) => {
          Utils.log(
            `  ${idx + 1}. ${store.noStr} - ${store.name} (${store.district})`,
            "INFO"
          );
        });
      } else {
        Utils.log(`⚠️ NO ${priority} STORES FOUND - Check:`, "WARN");
        Utils.log(`  1. Column ${col} has data`, "WARN");
        Utils.log(`  2. shouldVisit column (${col + 11}) has "YES"`, "WARN");
        Utils.log(
          `  3. Frequency ${priorityConfig.requiredVisits} >= ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY}`,
          "WARN"
        );
      }

      return stores;
    } catch (error) {
      Utils.log(`❌ Error loading ${priority} stores: ${error}`, "ERROR");
      return [];
    }
  }

  // Additional helper functions...
  static calculateDayCenter(stores) {
    if (!stores || stores.length === 0) return null;

    const lat =
      stores.reduce((sum, store) => sum + store.lat, 0) / stores.length;
    const lng =
      stores.reduce((sum, store) => sum + store.lng, 0) / stores.length;

    return { lat, lng };
  }

  static calculateStoreGroupCenter(stores) {
    return this.calculateDayCenter(stores);
  }

  static findUnderOptimizedDays(workingDays, minStores) {
    const days = [];
    let globalIndex = 0;

    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        const storeCount = dayInfo.optimizedStores
          ? dayInfo.optimizedStores.length
          : 0;

        if (storeCount > 0 && storeCount < minStores) {
          days.push({
            weekIndex,
            dayIndex,
            globalIndex,
            dayInfo,
            storeCount,
          });
        }
        globalIndex++;
      });
    });

    return days;
  }

  static clearWorkingDays(workingDays) {
    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        dayInfo.optimizedStores = [];
      });
    });
  }

  static getTotalAvailableDays(workingDays) {
    return workingDays.reduce((total, week) => total + week.length, 0);
  }

  static findDayByIndex(workingDays, targetIndex) {
    let currentIndex = 0;

    for (const week of workingDays) {
      for (const dayInfo of week) {
        if (currentIndex === targetIndex) {
          return dayInfo;
        }
        currentIndex++;
      }
    }

    return null;
  }

  static createBasicRoute(stores, dayInfo, startOrder = 0) {
    return stores.map((store, index) => ({
      ...store,
      order: startOrder + index + 1,
      distance: 0, // Will be calculated in detailed route
      duration: 0,
      arrivalTime: 0,
      departTime: 0,
    }));
  }

  static createDetailedRoute(stores, dayInfo) {
    if (!stores || stores.length === 0) return [];

    const route = [];
    let currentTime = CONFIG.WORK.START;
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;

    const isFriday = dayInfo.isFriday || false;
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

  static trimStoresForTimeConstraint(detailedRoute, dayInfo) {
    const trimmed = [];

    for (const store of detailedRoute) {
      if (store.departTime <= CONFIG.WORK.END) {
        trimmed.push(store);
      } else {
        break; // Stop at first violation
      }
    }

    return trimmed;
  }

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

    return optimized;
  }

  static removeDuplicatesAcrossDays(workingDays) {
    const allStores = [];
    const storeLocations = new Map(); // Track where each store is located

    // Collect all stores with their day locations
    let globalDayIndex = 0;
    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        if (dayInfo.optimizedStores) {
          dayInfo.optimizedStores.forEach((store, storeIndex) => {
            const key = store.noStr || store.name;
            allStores.push({
              ...store,
              dayLocation: { weekIndex, dayIndex, storeIndex, globalDayIndex },
            });

            if (!storeLocations.has(key)) {
              storeLocations.set(key, []);
            }
            storeLocations.get(key).push({
              weekIndex,
              dayIndex,
              storeIndex,
              globalDayIndex,
              store,
            });
          });
        }
        globalDayIndex++;
      });
    });

    // Find duplicates
    const duplicates = [];
    storeLocations.forEach((locations, storeKey) => {
      if (locations.length > 1) {
        duplicates.push({ storeKey, locations });
      }
    });

    let duplicatesRemoved = 0;

    // Remove duplicates (keep first occurrence)
    duplicates.forEach(({ storeKey, locations }) => {
      // Sort by day index to keep earliest occurrence
      locations.sort((a, b) => a.globalDayIndex - b.globalDayIndex);

      // Remove all except the first
      for (let i = 1; i < locations.length; i++) {
        const location = locations[i];
        const week = workingDays[location.weekIndex];
        const dayInfo = week[location.dayIndex];

        // Find and remove the store
        const storeIndex = dayInfo.optimizedStores.findIndex(
          (s) => (s.noStr || s.name) === storeKey
        );

        if (storeIndex !== -1) {
          dayInfo.optimizedStores.splice(storeIndex, 1);
          duplicatesRemoved++;

          Utils.log(
            `Removed duplicate ${storeKey} from day ${
              location.globalDayIndex + 1
            }`,
            "WARN"
          );
        }
      }
    });

    return { duplicatesRemoved };
  }

  static logOptimizationSummary(result) {
    Utils.log("", "INFO");
    Utils.log("📊 LAYERED PRIORITY OPTIMIZATION SUMMARY:", "INFO");
    Utils.log("==========================================", "INFO");

    // Phase 1: P1 Results - CRITICAL SECTION
    Utils.log(`PHASE 1 - P1 Foundation (CRITICAL):`, "INFO");
    Utils.log(
      `• Total P1 required: ${result.phase1_p1.totalP1Required}`,
      "INFO"
    );
    Utils.log(`• P1 stores placed: ${result.phase1_p1.storesPlaced}`, "INFO");
    Utils.log(
      `• P1 duplicates removed: ${result.phase1_p1.duplicatesRemoved}`,
      "INFO"
    );
    Utils.log(`• P1 days combined: ${result.phase1_p1.daysCombined}`, "INFO");

    // ✅ CRITICAL WARNING for unscheduled P1
    if (result.phase1_p1.p1NotScheduled > 0) {
      Utils.log(
        `❌ CRITICAL: ${result.phase1_p1.p1NotScheduled} P1 STORES NOT SCHEDULED!`,
        "ERROR"
      );
      Utils.log(
        `❌ This violates P1 requirement - ALL P1 must be scheduled`,
        "ERROR"
      );
    } else {
      Utils.log(`✅ SUCCESS: All P1 stores successfully scheduled`, "INFO");
    }
    Utils.log("", "INFO");

    // Phase 2: P2 Results
    Utils.log(`PHASE 2 - P2 Enhancement:`, "INFO");
    Utils.log(
      `• Days optimized with P2: ${result.phase2_p2.daysOptimized}`,
      "INFO"
    );
    Utils.log(`• P2 stores added: ${result.phase2_p2.storesAdded}`, "INFO");
    Utils.log(
      `• P2 duplicates removed: ${result.phase2_p2.duplicatesRemoved}`,
      "INFO"
    );
    Utils.log(
      `• Days combined after P2: ${result.phase2_p2.daysCombined}`,
      "INFO"
    );
    Utils.log("", "INFO");

    // Phase 3: P3 Results
    Utils.log(`PHASE 3 - P3 Enhancement:`, "INFO");
    Utils.log(
      `• Days optimized with P3: ${result.phase3_p3.daysOptimized}`,
      "INFO"
    );
    Utils.log(`• P3 stores added: ${result.phase3_p3.storesAdded}`, "INFO");
    Utils.log(
      `• P3 duplicates removed: ${result.phase3_p3.duplicatesRemoved}`,
      "INFO"
    );
    Utils.log(
      `• Days combined after P3: ${result.phase3_p3.daysCombined}`,
      "INFO"
    );

    // ❓ P3 Source validation
    if (result.phase3_p3.storesAdded === 0) {
      Utils.log(`ℹ️ No P3 stores added - Check P3 configuration:`, "INFO");
      Utils.log(`  • Verify P3 column exists in sheet`, "INFO");
      Utils.log(
        `  • Check P3 frequency setting in CONFIG.PRIORITIES.P3`,
        "INFO"
      );
      Utils.log(`  • Ensure P3 stores have shouldVisit = "YES"`, "INFO");
    }
    Utils.log("", "INFO");

    // Phase 4: Final Results
    Utils.log(`PHASE 4 - Final Validation:`, "INFO");
    Utils.log(
      `• Time violations found: ${result.phase4_final.timeViolations}`,
      "INFO"
    );
    Utils.log(
      `• Stores removed for time: ${result.phase4_final.storesRemoved}`,
      "INFO"
    );
    Utils.log(
      `• Final active days: ${result.phase4_final.finalDaysCount}`,
      "INFO"
    );
    Utils.log("", "INFO");

    // Overall Summary with P1 focus
    const totalStoresAdded =
      result.phase2_p2.storesAdded + result.phase3_p3.storesAdded;
    const totalDaysOptimized =
      result.phase2_p2.daysOptimized + result.phase3_p3.daysOptimized;
    const totalDuplicatesRemoved =
      result.phase1_p1.duplicatesRemoved +
      result.phase2_p2.duplicatesRemoved +
      result.phase3_p3.duplicatesRemoved;
    const totalDaysCombined =
      result.phase1_p1.daysCombined +
      result.phase2_p2.daysCombined +
      result.phase3_p3.daysCombined;

    Utils.log(`OVERALL RESULTS:`, "INFO");
    Utils.log(
      `• P1 coverage: ${result.phase1_p1.storesPlaced}/${
        result.phase1_p1.totalP1Required
      } (${(
        (result.phase1_p1.storesPlaced / result.phase1_p1.totalP1Required) *
        100
      ).toFixed(1)}%)`,
      "INFO"
    );
    Utils.log(`• Total filler stores added: ${totalStoresAdded}`, "INFO");
    Utils.log(`• Total days optimized: ${totalDaysOptimized}`, "INFO");
    Utils.log(`• Total duplicates removed: ${totalDuplicatesRemoved}`, "INFO");
    Utils.log(`• Total days combined: ${totalDaysCombined}`, "INFO");
    Utils.log("", "INFO");

    // Success/Warning indicators
    if (result.phase1_p1.p1NotScheduled === 0) {
      Utils.log("✅ P1 REQUIREMENT MET: All P1 stores scheduled", "INFO");
    } else {
      Utils.log("❌ P1 REQUIREMENT FAILED: Some P1 stores missing", "ERROR");
    }

    if (totalStoresAdded > 0) {
      Utils.log(
        "✅ Successfully utilized P2/P3 stores with layered approach",
        "INFO"
      );
    }
    if (totalDaysCombined > 0) {
      Utils.log("✅ Successfully combined under-optimized days", "INFO");
    }
    if (result.phase4_final.timeViolations === 0) {
      Utils.log("✅ All days meet time constraints", "INFO");
    } else {
      Utils.log("⚠️ Some days required time constraint trimming", "WARN");
    }

    Utils.log("=== LAYERED PRIORITY OPTIMIZATION COMPLETED ===", "INFO");
  }
}

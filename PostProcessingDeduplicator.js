// ==================== POST-PROCESSING DEDUPLICATOR - STANDALONE ====================
class PostProcessingDeduplicator {
  // Main post-processing function - call this after route optimization
  static cleanupFinalRoutes(workingDays) {
    Utils.log("=== STARTING POST-PROCESSING DEDUPLICATION ===", "INFO");

    // Step 1: Collect all scheduled stores from all days
    const allScheduledStores = this.collectAllScheduledStores(workingDays);

    // Step 2: Group by noStr and analyze visit frequency vs actual appearances
    const storeGroups = this.groupStoresByNoStr(allScheduledStores);

    // Step 3: Apply visit frequency rules and remove excess duplicates
    const cleanupResult = this.applyVisitFrequencyRules(storeGroups);

    // Step 4: Update working days with cleaned stores
    this.updateWorkingDaysWithCleanedStores(
      workingDays,
      cleanupResult.finalStores
    );

    // Step 5: Log cleanup summary
    this.logCleanupSummary(cleanupResult);

    Utils.log("=== POST-PROCESSING DEDUPLICATION COMPLETED ===", "INFO");

    return cleanupResult;
  }

  // Step 1: Collect all stores from all days with their day info
  static collectAllScheduledStores(workingDays) {
    const allStores = [];
    let globalDayIndex = 0;

    workingDays.forEach((week, weekIndex) => {
      week.forEach((dayInfo, dayIndex) => {
        if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
          dayInfo.optimizedStores.forEach((store, storeIndex) => {
            allStores.push({
              ...store,
              weekIndex: weekIndex,
              dayIndex: dayIndex,
              globalDayIndex: globalDayIndex,
              storeIndex: storeIndex,
              dayInfo: dayInfo,
              originalPosition: {
                week: weekIndex,
                day: dayIndex,
                store: storeIndex,
              },
            });
          });
        }
        globalDayIndex++;
      });
    });

    Utils.log(`Collected ${allStores.length} stores from all days`, "INFO");
    return allStores;
  }

  // Step 2: Group stores by noStr
  static groupStoresByNoStr(allStores) {
    const storeGroups = new Map();

    allStores.forEach((store) => {
      const noStr = store.noStr || store.name;

      if (!storeGroups.has(noStr)) {
        storeGroups.set(noStr, {
          noStr: noStr,
          name: store.name,
          baseFrequency: store.baseFrequency || 1,
          expectedVisits: Math.floor(store.baseFrequency || 1),
          actualAppearances: [],
          priority: store.priority,
          retailer: store.retailer,
          district: store.district,
        });
      }

      storeGroups.get(noStr).actualAppearances.push(store);
    });

    Utils.log(`Grouped into ${storeGroups.size} unique stores`, "INFO");
    return storeGroups;
  }

  // Step 3: Apply visit frequency rules and clean up duplicates
  static applyVisitFrequencyRules(storeGroups) {
    const finalStores = [];
    const cleanupStats = {
      totalUniqueStores: storeGroups.size,
      storesWithDuplicates: 0,
      duplicatesRemoved: 0,
      storesKept: 0,
      cleanupActions: [],
    };

    storeGroups.forEach((group, noStr) => {
      const expectedVisits = group.expectedVisits;
      const actualAppearances = group.actualAppearances.length;

      if (actualAppearances <= expectedVisits) {
        // No duplicates - keep all appearances
        finalStores.push(...group.actualAppearances);
        cleanupStats.storesKept += actualAppearances;

        Utils.log(
          `✅ KEEP ALL: ${noStr} (${group.name}) - ${actualAppearances}/${expectedVisits} visits OK`,
          "INFO"
        );
      } else {
        // Has duplicates - apply cleanup rules
        cleanupStats.storesWithDuplicates++;
        const duplicatesCount = actualAppearances - expectedVisits;
        cleanupStats.duplicatesRemoved += duplicatesCount;

        Utils.log(
          `🔧 CLEANUP: ${noStr} (${group.name}) - ${actualAppearances} appearances, expected ${expectedVisits}`,
          "WARN"
        );

        const selectedStores = this.selectBestStores(group, expectedVisits);
        finalStores.push(...selectedStores);
        cleanupStats.storesKept += selectedStores.length;

        // Log cleanup action
        cleanupStats.cleanupActions.push({
          noStr: noStr,
          name: group.name,
          before: actualAppearances,
          after: selectedStores.length,
          removed: duplicatesCount,
          rule: this.getCleanupRule(group),
        });
      }
    });

    return {
      finalStores: finalStores,
      cleanupStats: cleanupStats,
    };
  }

  // Select best stores to keep based on various criteria
  static selectBestStores(group, maxVisits) {
    const stores = [...group.actualAppearances];

    // RULE 1: If frequency = 1, keep only 1 visit (the best one)
    if (group.baseFrequency <= 1 && maxVisits === 1) {
      const bestStore = this.selectSingleBestStore(stores);
      Utils.log(
        `  → RULE 1: Frequency ≤ 1, keeping best store on day ${bestStore.globalDayIndex}`,
        "INFO"
      );
      return [bestStore];
    }

    // RULE 2: If frequency > 1, keep maxVisits with proper gap distribution
    if (maxVisits > 1) {
      const selectedStores = this.selectMultipleStoresWithGaps(
        stores,
        maxVisits
      );
      Utils.log(
        `  → RULE 2: Multi-visit, keeping ${selectedStores.length} stores with proper gaps`,
        "INFO"
      );
      return selectedStores;
    }

    // RULE 3: Fractional frequency (between 0 and 1), keep 1 visit
    const bestStore = this.selectSingleBestStore(stores);
    Utils.log(
      `  → RULE 3: Fractional frequency, keeping best store on day ${bestStore.globalDayIndex}`,
      "INFO"
    );
    return [bestStore];
  }

  // Select single best store based on multiple criteria
  static selectSingleBestStore(stores) {
    // Sort by multiple criteria:
    // 1. Earliest day (prefer earlier in month)
    // 2. Higher priority (P1 > P2 > P3)
    // 3. No time violations
    // 4. Better position in day (earlier visits)

    return stores.sort((a, b) => {
      // 1. Prefer earlier days
      if (a.globalDayIndex !== b.globalDayIndex) {
        return a.globalDayIndex - b.globalDayIndex;
      }

      // 2. Prefer higher priority (lower number)
      const priorityA = parseInt(a.priority?.replace("P", "")) || 999;
      const priorityB = parseInt(b.priority?.replace("P", "")) || 999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // 3. Prefer no time violations
      const violationA = a.isAfter6PM || a.timeWarning ? 1 : 0;
      const violationB = b.isAfter6PM || b.timeWarning ? 1 : 0;
      if (violationA !== violationB) {
        return violationA - violationB;
      }

      // 4. Prefer earlier position in day
      return a.storeIndex - b.storeIndex;
    })[0];
  }

  // Select multiple stores with proper 5-day gaps
  static selectMultipleStoresWithGaps(stores, maxVisits) {
    // Sort by day
    const sortedStores = stores.sort(
      (a, b) => a.globalDayIndex - b.globalDayIndex
    );

    const selectedStores = [];
    let lastSelectedDay = -10; // Start with large negative to allow first selection

    for (const store of sortedStores) {
      // Check if this store maintains minimum 5-day gap
      if (store.globalDayIndex - lastSelectedDay >= 5) {
        selectedStores.push(store);
        lastSelectedDay = store.globalDayIndex;

        // Stop if we have enough visits
        if (selectedStores.length >= maxVisits) {
          break;
        }
      }
    }

    // If we couldn't get enough visits with gaps, fill remaining slots
    if (selectedStores.length < maxVisits) {
      const remainingStores = sortedStores.filter(
        (s) => !selectedStores.includes(s)
      );
      const stillNeeded = maxVisits - selectedStores.length;

      // Add best remaining stores (even if gap is not ideal)
      const additionalStores = this.selectBestFromRemaining(
        remainingStores,
        stillNeeded
      );
      selectedStores.push(...additionalStores);
    }

    return selectedStores;
  }

  // Select best stores from remaining options
  static selectBestFromRemaining(remainingStores, count) {
    return remainingStores
      .sort((a, b) => {
        // Prefer higher priority
        const priorityA = parseInt(a.priority?.replace("P", "")) || 999;
        const priorityB = parseInt(b.priority?.replace("P", "")) || 999;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // Prefer no time violations
        const violationA = a.isAfter6PM || a.timeWarning ? 1 : 0;
        const violationB = b.isAfter6PM || b.timeWarning ? 1 : 0;
        if (violationA !== violationB) {
          return violationA - violationB;
        }

        // Prefer earlier days
        return a.globalDayIndex - b.globalDayIndex;
      })
      .slice(0, count);
  }

  // Step 4: Update working days with cleaned stores
  static updateWorkingDaysWithCleanedStores(workingDays, finalStores) {
    // Clear all existing stores
    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores) {
          dayInfo.optimizedStores = [];
        }
      });
    });

    // Re-assign cleaned stores to their original days
    finalStores.forEach((store) => {
      const week = workingDays[store.weekIndex];
      if (week && week[store.dayIndex]) {
        const dayInfo = week[store.dayIndex];
        if (!dayInfo.optimizedStores) {
          dayInfo.optimizedStores = [];
        }
        dayInfo.optimizedStores.push(store);
      }
    });

    // Re-order stores in each day and update order numbers
    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
          // Sort by original store index to maintain route order
          dayInfo.optimizedStores.sort((a, b) => a.storeIndex - b.storeIndex);

          // Update order numbers
          dayInfo.optimizedStores.forEach((store, index) => {
            store.order = index + 1;
          });
        }
      });
    });

    Utils.log(
      `Updated working days with ${finalStores.length} cleaned stores`,
      "INFO"
    );
  }

  // Step 5: Log cleanup summary
  static logCleanupSummary(cleanupResult) {
    const stats = cleanupResult.cleanupStats;

    Utils.log("", "INFO");
    Utils.log("📊 POST-PROCESSING CLEANUP SUMMARY:", "INFO");
    Utils.log("=====================================", "INFO");
    Utils.log(`Total unique stores: ${stats.totalUniqueStores}`, "INFO");
    Utils.log(`Stores with duplicates: ${stats.storesWithDuplicates}`, "INFO");
    Utils.log(`Duplicates removed: ${stats.duplicatesRemoved}`, "INFO");
    Utils.log(`Final stores kept: ${stats.storesKept}`, "INFO");
    Utils.log("", "INFO");

    if (stats.cleanupActions.length > 0) {
      Utils.log("🔧 CLEANUP ACTIONS PERFORMED:", "INFO");
      stats.cleanupActions.forEach((action, index) => {
        Utils.log(`${index + 1}. ${action.noStr} (${action.name})`, "INFO");
        Utils.log(
          `   Before: ${action.before} visits → After: ${action.after} visits`,
          "INFO"
        );
        Utils.log(`   Removed: ${action.removed} duplicates`, "INFO");
        Utils.log(`   Rule: ${action.rule}`, "INFO");
        Utils.log("", "INFO");
      });
    } else {
      Utils.log(
        "✅ No cleanup needed - all stores had correct visit frequencies",
        "INFO"
      );
    }

    Utils.log("=== POST-PROCESSING CLEANUP COMPLETED ===", "INFO");
  }

  // Helper: Get cleanup rule description
  static getCleanupRule(group) {
    if (group.baseFrequency <= 1) {
      return `Frequency ≤ 1: Keep only 1 visit (best quality)`;
    } else if (group.expectedVisits > 1) {
      return `Multi-visit: Keep ${group.expectedVisits} visits with 5-day gaps`;
    } else {
      return `Fractional frequency: Keep 1 visit`;
    }
  }
}

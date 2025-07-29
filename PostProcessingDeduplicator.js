// ==================== UPDATED POST-PROCESSING WITH LAYERED APPROACH ====================
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

  // NEW: Layered consolidation using your algorithm
  static consolidateSmallDays(workingDays) {
    Utils.log("=== STARTING LAYERED PRIORITY CONSOLIDATION ===", "INFO");

    // Use the new layered priority optimizer
    const layeredResult =
      LayeredPriorityOptimizer.optimizeWorkingDays(workingDays);

    // Convert to the expected format for main system compatibility
    const consolidationResult =
      this.convertLayeredResultToLegacyFormat(layeredResult);

    this.logConsolidationSummary(consolidationResult, layeredResult);

    Utils.log("=== LAYERED PRIORITY CONSOLIDATION COMPLETED ===", "INFO");
    return consolidationResult;
  }

  // Convert layered results to legacy format for main system compatibility
  static convertLayeredResultToLegacyFormat(layeredResult) {
    const totalP2Added = layeredResult.phase2_p2.storesAdded;
    const totalP3Added = layeredResult.phase3_p3.storesAdded;
    const totalDaysOptimized =
      layeredResult.phase2_p2.daysOptimized +
      layeredResult.phase3_p3.daysOptimized;
    const totalDaysCombined =
      layeredResult.phase1_p1.daysCombined +
      layeredResult.phase2_p2.daysCombined +
      layeredResult.phase3_p3.daysCombined;
    const totalStoresRedistributed =
      layeredResult.phase1_p1.storesPlaced +
      layeredResult.phase2_p2.storesAdded +
      layeredResult.phase3_p3.storesAdded;

    return {
      consolidationCount: totalDaysOptimized,
      mergedDays: totalDaysCombined,
      distributedStores: totalStoresRedistributed,
      p2StoresAdded: totalP2Added,
      p3StoresAdded: totalP3Added, // New field for P3 tracking
      emptyDaysFilled: this.calculateEmptyDaysFilled(layeredResult),
      daysToppedup: this.calculateDaysToppedup(layeredResult),

      // Additional layered-specific metrics
      layeredMetrics: {
        p1Foundation: layeredResult.phase1_p1,
        p2Enhancement: layeredResult.phase2_p2,
        p3Enhancement: layeredResult.phase3_p3,
        finalValidation: layeredResult.phase4_final,
        algorithmUsed: "LAYERED_PRIORITY_OPTIMIZATION",
      },
    };
  }

  // Calculate empty days filled (estimate based on P2/P3 additions)
  static calculateEmptyDaysFilled(layeredResult) {
    // Estimate: Days that were likely empty and are now filled
    // This is an approximation since we don't track exact empty->filled transitions
    const totalNewStores =
      layeredResult.phase2_p2.storesAdded + layeredResult.phase3_p3.storesAdded;
    const avgStoresPerEmptyDay = 8; // Estimate
    return Math.floor(totalNewStores / avgStoresPerEmptyDay);
  }

  // Calculate days topped up (estimate based on optimization counts)
  static calculateDaysToppedup(layeredResult) {
    // Days that were under-optimized and got additional stores
    return (
      layeredResult.phase2_p2.daysOptimized +
      layeredResult.phase3_p3.daysOptimized
    );
  }

  // Enhanced logging that shows both legacy and layered format
  static logConsolidationSummary(consolidationResult, layeredResult) {
    Utils.log("", "INFO");
    Utils.log("📊 DAY CONSOLIDATION SUMMARY:", "INFO");
    Utils.log("==============================", "INFO");

    // Legacy format (for compatibility with existing system)
    Utils.log("LEGACY FORMAT (for compatibility):", "INFO");
    Utils.log(
      `• Days optimized: ${consolidationResult.consolidationCount}`,
      "INFO"
    );
    Utils.log(`• Days merged: ${consolidationResult.mergedDays}`, "INFO");
    Utils.log(
      `• Stores redistributed: ${consolidationResult.distributedStores}`,
      "INFO"
    );
    Utils.log(
      `• P2 stores added: ${consolidationResult.p2StoresAdded}`,
      "INFO"
    );
    Utils.log(
      `• P3 stores added: ${consolidationResult.p3StoresAdded}`,
      "INFO"
    );
    Utils.log(
      `• Empty days filled: ${consolidationResult.emptyDaysFilled}`,
      "INFO"
    );
    Utils.log(`• Days topped up: ${consolidationResult.daysToppedup}`, "INFO");
    Utils.log("", "INFO");

    // Layered approach details
    Utils.log("LAYERED APPROACH DETAILS:", "INFO");
    Utils.log(
      `• Algorithm: ${consolidationResult.layeredMetrics.algorithmUsed}`,
      "INFO"
    );
    Utils.log(
      `• P1 foundation days: ${layeredResult.phase1_p1.daysCreated}`,
      "INFO"
    );
    Utils.log(
      `• P2 enhancement days: ${layeredResult.phase2_p2.daysOptimized}`,
      "INFO"
    );
    Utils.log(
      `• P3 enhancement days: ${layeredResult.phase3_p3.daysOptimized}`,
      "INFO"
    );
    Utils.log(
      `• Time violations handled: ${layeredResult.phase4_final.timeViolations}`,
      "INFO"
    );
    Utils.log(
      `• Final active days: ${layeredResult.phase4_final.finalDaysCount}`,
      "INFO"
    );
    Utils.log("", "INFO");

    // Success indicators
    const totalStoresAdded =
      consolidationResult.p2StoresAdded + consolidationResult.p3StoresAdded;
    if (totalStoresAdded > 0) {
      Utils.log(
        "✅ Successfully utilized P2/P3 stores with layered approach",
        "INFO"
      );
    }
    if (consolidationResult.mergedDays > 0) {
      Utils.log(
        "✅ Successfully combined under-optimized days geographically",
        "INFO"
      );
    }
    if (layeredResult.phase4_final.timeViolations === 0) {
      Utils.log("✅ All days meet 6:20 PM time constraint", "INFO");
    } else {
      Utils.log(
        `⚠️ ${layeredResult.phase4_final.timeViolations} days required time trimming`,
        "WARN"
      );
    }

    Utils.log(
      "🎯 LAYERED OPTIMIZATION: P1 Foundation → P2 Enhancement → P3 Enhancement → Time Validation",
      "INFO"
    );
  }

  // Existing methods from original PostProcessingDeduplicator (keeping for compatibility)
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
        finalStores.push(...group.actualAppearances);
        cleanupStats.storesKept += actualAppearances;
      } else {
        cleanupStats.storesWithDuplicates++;
        const duplicatesCount = actualAppearances - expectedVisits;
        cleanupStats.duplicatesRemoved += duplicatesCount;

        const selectedStores = this.selectBestStores(group, expectedVisits);
        finalStores.push(...selectedStores);
        cleanupStats.storesKept += selectedStores.length;

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

  static selectBestStores(group, maxVisits) {
    const stores = [...group.actualAppearances];

    if (group.baseFrequency <= 1 && maxVisits === 1) {
      const bestStore = this.selectSingleBestStore(stores);
      return [bestStore];
    }

    if (maxVisits > 1) {
      const selectedStores = this.selectMultipleStoresWithGaps(
        stores,
        maxVisits
      );
      return selectedStores;
    }

    const bestStore = this.selectSingleBestStore(stores);
    return [bestStore];
  }

  static selectSingleBestStore(stores) {
    return stores.sort((a, b) => {
      if (a.globalDayIndex !== b.globalDayIndex) {
        return a.globalDayIndex - b.globalDayIndex;
      }

      const priorityA = parseInt(a.priority?.replace("P", "")) || 999;
      const priorityB = parseInt(b.priority?.replace("P", "")) || 999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const violationA = a.isAfter6PM || a.timeWarning ? 1 : 0;
      const violationB = b.isAfter6PM || b.timeWarning ? 1 : 0;
      if (violationA !== violationB) {
        return violationA - violationB;
      }

      return a.storeIndex - b.storeIndex;
    })[0];
  }

  static selectMultipleStoresWithGaps(stores, maxVisits) {
    const sortedStores = stores.sort(
      (a, b) => a.globalDayIndex - b.globalDayIndex
    );

    const selectedStores = [];
    let lastSelectedDay = -10;

    for (const store of sortedStores) {
      if (store.globalDayIndex - lastSelectedDay >= 5) {
        selectedStores.push(store);
        lastSelectedDay = store.globalDayIndex;

        if (selectedStores.length >= maxVisits) {
          break;
        }
      }
    }

    if (selectedStores.length < maxVisits) {
      const remainingStores = sortedStores.filter(
        (s) => !selectedStores.includes(s)
      );
      const stillNeeded = maxVisits - selectedStores.length;

      const additionalStores = this.selectBestFromRemaining(
        remainingStores,
        stillNeeded
      );
      selectedStores.push(...additionalStores);
    }

    return selectedStores;
  }

  static selectBestFromRemaining(remainingStores, count) {
    return remainingStores
      .sort((a, b) => {
        const priorityA = parseInt(a.priority?.replace("P", "")) || 999;
        const priorityB = parseInt(b.priority?.replace("P", "")) || 999;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        const violationA = a.isAfter6PM || a.timeWarning ? 1 : 0;
        const violationB = b.isAfter6PM || b.timeWarning ? 1 : 0;
        if (violationA !== violationB) {
          return violationA - violationB;
        }

        return a.globalDayIndex - b.globalDayIndex;
      })
      .slice(0, count);
  }

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

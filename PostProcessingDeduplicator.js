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

  // NEW: Structured consolidation using your 17-step algorithm
  static consolidateSmallDays(workingDays) {
    Utils.log("=== STARTING 17-STEP STRUCTURED CONSOLIDATION ===", "INFO");

    // Use the new structured layered optimizer
    const structuredResult =
      StructuredLayeredOptimizer.optimizeWorkingDays(workingDays);

    // Convert to the expected format for main system compatibility
    const consolidationResult =
      this.convertStructuredResultToLegacyFormat(structuredResult);

    this.logConsolidationSummary(consolidationResult, structuredResult);

    Utils.log("=== 17-STEP STRUCTURED CONSOLIDATION COMPLETED ===", "INFO");
    return consolidationResult;
  }

  // Convert structured results to legacy format for main system compatibility
  static convertStructuredResultToLegacyFormat(structuredResult) {
    // Calculate totals from structured results
    const totalP2Added =
      structuredResult.step9_p2NonOptimized.storesAdded +
      structuredResult.step10_p2Empty.storesAdded;

    const totalP3Added =
      structuredResult.step14_p3NonOptimized.storesAdded +
      structuredResult.step15_p3Empty.storesAdded;

    const totalDaysOptimized =
      structuredResult.step9_p2NonOptimized.daysOptimized +
      structuredResult.step10_p2Empty.daysFilled +
      structuredResult.step14_p3NonOptimized.daysOptimized +
      structuredResult.step15_p3Empty.daysFilled;

    const totalStoresRedistributed =
      structuredResult.step3_p1Mapping.storesAssigned +
      totalP2Added +
      totalP3Added;

    const emptyDaysFilled =
      structuredResult.step10_p2Empty.daysFilled +
      structuredResult.step15_p3Empty.daysFilled;

    const daysToppedup =
      structuredResult.step9_p2NonOptimized.daysOptimized +
      structuredResult.step14_p3NonOptimized.daysOptimized;

    return {
      consolidationCount: totalDaysOptimized,
      mergedDays: 0, // 17-step process doesn't merge days, it fills them
      distributedStores: totalStoresRedistributed,
      p2StoresAdded: totalP2Added,
      p3StoresAdded: totalP3Added,
      emptyDaysFilled: emptyDaysFilled,
      daysToppedup: daysToppedup,

      // Additional structured-specific metrics
      structuredMetrics: {
        algorithmUsed: "17_STEP_STRUCTURED_LAYERED",
        p1Foundation: {
          storesLoaded: structuredResult.step1_p1Loading.storesLoaded,
          clustersCreated: structuredResult.step2_p1Clustering.clustersCreated,
          storesAssigned: structuredResult.step3_p1Mapping.storesAssigned,
          daysUsed: structuredResult.step3_p1Mapping.daysUsed,
        },
        p2Enhancement: {
          storesLoaded: structuredResult.step7_p2Loading.storesLoaded,
          clustersCreated: structuredResult.step8_p2Clustering.clustersCreated,
          nonOptimizedFilled: structuredResult.step9_p2NonOptimized.storesAdded,
          emptyDaysFilled: structuredResult.step10_p2Empty.storesAdded,
        },
        p3Enhancement: {
          storesLoaded: structuredResult.step12_p3Loading.storesLoaded,
          clustersCreated: structuredResult.step13_p3Clustering.clustersCreated,
          nonOptimizedFilled:
            structuredResult.step14_p3NonOptimized.storesAdded,
          emptyDaysFilled: structuredResult.step15_p3Empty.storesAdded,
        },
        finalization: {
          daysReorganized: structuredResult.step16_reorganize.daysReorganized,
          timeViolations: structuredResult.step17_finalCheck.timeViolations,
          storesRemoved: structuredResult.step17_finalCheck.storesRemoved,
        },
      },
    };
  }

  // Enhanced logging that shows both legacy and structured format
  static logConsolidationSummary(consolidationResult, structuredResult) {
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

    // Structured approach details
    Utils.log("17-STEP STRUCTURED APPROACH DETAILS:", "INFO");
    Utils.log(
      `• Algorithm: ${consolidationResult.structuredMetrics.algorithmUsed}`,
      "INFO"
    );

    // P1 Foundation Results
    const p1 = consolidationResult.structuredMetrics.p1Foundation;
    Utils.log(
      `• P1 Foundation: ${p1.storesLoaded} loaded → ${p1.clustersCreated} clusters → ${p1.storesAssigned} assigned to ${p1.daysUsed} days`,
      "INFO"
    );

    // P2 Enhancement Results
    const p2 = consolidationResult.structuredMetrics.p2Enhancement;
    if (p2.storesLoaded > 0) {
      Utils.log(
        `• P2 Enhancement: ${p2.storesLoaded} loaded → ${
          p2.clustersCreated
        } clusters → ${p2.nonOptimizedFilled + p2.emptyDaysFilled} used`,
        "INFO"
      );
    }

    // P3 Enhancement Results
    const p3 = consolidationResult.structuredMetrics.p3Enhancement;
    if (p3.storesLoaded > 0) {
      Utils.log(
        `• P3 Enhancement: ${p3.storesLoaded} loaded → ${
          p3.clustersCreated
        } clusters → ${p3.nonOptimizedFilled + p3.emptyDaysFilled} used`,
        "INFO"
      );
    }

    // Finalization Results
    const final = consolidationResult.structuredMetrics.finalization;
    Utils.log(
      `• Finalization: ${final.daysReorganized} days reorganized, ${final.timeViolations} time violations handled`,
      "INFO"
    );
    Utils.log("", "INFO");

    // Success indicators with structured context
    const totalStoresLoaded =
      p1.storesLoaded + p2.storesLoaded + p3.storesLoaded;
    const totalStoresUsed =
      p1.storesAssigned +
      (p2.nonOptimizedFilled + p2.emptyDaysFilled) +
      (p3.nonOptimizedFilled + p3.emptyDaysFilled);

    if (totalStoresLoaded > 0) {
      Utils.log(
        `📊 OVERALL UTILIZATION: ${totalStoresUsed}/${totalStoresLoaded} stores used (${(
          (totalStoresUsed / totalStoresLoaded) *
          100
        ).toFixed(1)}%)`,
        "INFO"
      );
    }

    if (p1.storesLoaded > 0 && p1.storesAssigned === p1.storesLoaded) {
      Utils.log(
        "✅ P1 FOUNDATION: All P1 stores successfully scheduled",
        "INFO"
      );
    } else if (p1.storesLoaded > 0) {
      Utils.log(
        `❌ P1 FOUNDATION: ${
          p1.storesLoaded - p1.storesAssigned
        } P1 stores not scheduled`,
        "ERROR"
      );
    }

    if (consolidationResult.emptyDaysFilled > 0) {
      Utils.log("✅ EMPTY DAYS: Successfully filled with P2/P3 stores", "INFO");
    }

    if (consolidationResult.daysToppedup > 0) {
      Utils.log(
        "✅ NON-OPTIMIZED DAYS: Successfully enhanced with P2/P3 stores",
        "INFO"
      );
    }

    if (final.timeViolations === 0) {
      Utils.log("✅ TIME COMPLIANCE: All days finish by 6:20 PM", "INFO");
    } else {
      Utils.log(
        `⚠️ TIME VIOLATIONS: ${final.timeViolations} days required trimming (${final.storesRemoved} stores removed)`,
        "WARN"
      );
    }

    Utils.log(
      "🎯 17-STEP PROCESS: P1 List→Cluster→Map→Analyze | P2 List→Cluster→Fill | P3 List→Cluster→Fill | Reorganize→Final Check",
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

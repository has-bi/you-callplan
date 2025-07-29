// ==================== MAIN.JS - UPDATED WITH INTELLIGENT OPTIMIZATION ====================

function generateEnhancedMonthlyPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
    return;
  }

  try {
    Utils.log(
      "=== STARTING ENHANCED MONTHLY PLAN WITH INTELLIGENT OPTIMIZATION ===",
      "INFO"
    );
    ss.toast(
      "Initializing enhanced optimization with intelligent day consolidation...",
      "Processing",
      -1
    );

    const startTime = new Date();
    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();
    const outputManager = new OutputManager(ss);

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (!stores.length) {
      SpreadsheetApp.getUi().alert("No stores found for selected priorities.");
      return;
    }

    // Run normal optimization
    ss.toast("Running route optimization...", "Processing", -1);
    const planResult = routeOptimizer.optimizePlan(stores);

    // ✨ STEP 1: POST-PROCESSING CLEANUP (Remove duplicates)
    ss.toast("Removing duplicates and cleaning data...", "Processing", -1);
    const cleanupResult = PostProcessingDeduplicator.cleanupFinalRoutes(
      planResult.workingDays
    );

    // Add cleanup stats to result
    planResult.statistics.postProcessingCleanup = {
      duplicatesRemoved: cleanupResult.cleanupStats.duplicatesRemoved,
      storesWithDuplicates: cleanupResult.cleanupStats.storesWithDuplicates,
      finalStoreCount: cleanupResult.cleanupStats.storesKept,
      cleanupActions: cleanupResult.cleanupStats.cleanupActions.length,
    };

    // ✨ STEP 2: LAYERED PRIORITY CONSOLIDATION (Your Algorithm)
    ss.toast(
      "Applying layered priority optimization (P1→P2→P3)...",
      "Processing",
      -1
    );
    const consolidationResult = PostProcessingDeduplicator.consolidateSmallDays(
      planResult.workingDays
    );

    // Add layered consolidation stats to result
    planResult.statistics.layeredConsolidation = {
      daysOptimized: consolidationResult.consolidationCount,
      daysMerged: consolidationResult.mergedDays,
      storesRedistributed: consolidationResult.distributedStores,
      p2StoresAdded: consolidationResult.p2StoresAdded,
      p3StoresAdded: consolidationResult.p3StoresAdded, // New P3 tracking
      emptyDaysFilled: consolidationResult.emptyDaysFilled,
      daysToppedup: consolidationResult.daysToppedup,
      algorithmUsed:
        consolidationResult.layeredMetrics?.algorithmUsed ||
        "LAYERED_PRIORITY_OPTIMIZATION",

      // Detailed phase breakdown
      phaseBreakdown: consolidationResult.layeredMetrics,

      // Legacy compatibility
      dayConsolidation: {
        daysConsolidated: consolidationResult.consolidationCount,
        mergedDays: consolidationResult.mergedDays,
        distributedStores: consolidationResult.distributedStores,
        p2StoresAdded: consolidationResult.p2StoresAdded,
        emptyDaysFilled: consolidationResult.emptyDaysFilled,
        daysToppedup: consolidationResult.daysToppedup,
      },
    };

    const endTime = new Date();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    // Create output
    outputManager.createEnhancedSheet(planResult, utilConfig, stores);

    // Show enhanced completion message
    const stats = planResult.statistics;
    let completionMessage = `✅ INTELLIGENT OPTIMIZATION COMPLETED in ${processingTime}s!\n\n`;

    // Add cleanup information
    if (stats.postProcessingCleanup) {
      const cleanup = stats.postProcessingCleanup;
      completionMessage += `🧹 AUTO-CLEANUP RESULTS:\n`;
      completionMessage += `• Duplicates removed: ${cleanup.duplicatesRemoved}\n`;
      completionMessage += `• Stores cleaned: ${cleanup.storesWithDuplicates}\n`;
      completionMessage += `• Final store count: ${cleanup.finalStoreCount}\n\n`;
    }

    // Add layered consolidation information
    if (stats.layeredConsolidation) {
      const layered = stats.layeredConsolidation;
      completionMessage += `🎯 LAYERED PRIORITY CONSOLIDATION:\n`;
      completionMessage += `• Algorithm: ${layered.algorithmUsed}\n`;
      completionMessage += `• Days optimized: ${layered.daysOptimized}\n`;
      completionMessage += `• Days merged (geographic): ${
        layered.daysMerged || 0
      }\n`;
      completionMessage += `• Stores redistributed: ${
        layered.storesRedistributed || 0
      }\n`;

      if (layered.p2StoresAdded > 0) {
        completionMessage += `• P2 stores added: ${layered.p2StoresAdded}\n`;
      }

      if (layered.p3StoresAdded > 0) {
        completionMessage += `• P3 stores added: ${layered.p3StoresAdded}\n`;
      }

      if (layered.emptyDaysFilled > 0) {
        completionMessage += `• Empty days filled: ${layered.emptyDaysFilled}\n`;
      }

      if (layered.daysToppedup > 0) {
        completionMessage += `• Days topped up: ${layered.daysToppedup}\n`;
      }

      completionMessage += "\n";
    }

    // Add optimization results
    if (stats.crossBorderOptimization) {
      const crossBorderStats = stats.crossBorderOptimization;
      completionMessage += `📊 Route Optimization:\n`;
      completionMessage += `• ${crossBorderStats.daysAfter} optimized days\n`;
      completionMessage += `• ${crossBorderStats.avgUtilization} average utilization\n`;
      completionMessage += `• ${crossBorderStats.efficiencyGain} efficiency gain\n`;
      completionMessage += `• ${crossBorderStats.crossBorderDays} cross-border days\n`;
    } else {
      completionMessage += `📊 Route Optimization:\n`;
      completionMessage += `• ${stats.workingDays} working days used\n`;
      completionMessage += `• ${stats.averageStoresPerDay} stores/day average\n`;
      completionMessage += `• ${stats.totalDistance}km total distance\n`;
      completionMessage += `• ${stats.coveragePercentage}% coverage\n`;
    }

    completionMessage += `🚀 LAYERED APPROACH FEATURES:\n`;
    completionMessage += `• P1 Foundation → P2 Enhancement → P3 Enhancement\n`;
    completionMessage += `• Geographic proximity optimization\n`;
    completionMessage += `• Smart day combining (< 7 stores)\n`;
    completionMessage += `• Time constraint validation (≤ 6:20 PM)\n`;
    completionMessage += `• Cross-area store utilization allowed`;

    Utils.log(
      "=== LAYERED PRIORITY OPTIMIZATION WITH AREA-BASED CONSOLIDATION COMPLETED ===",
      "INFO"
    );
    ss.toast(completionMessage, "✅ Layered Success", 15);
  } catch (error) {
    Utils.log(
      "Error during intelligent optimization: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert(
      "Layered optimization failed: " + error.toString()
    );
  }
}

function generateBasicMonthlyPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
    return;
  }

  try {
    Utils.log("=== STARTING BASIC MONTHLY PLAN WITH BASIC FIXES ===", "INFO");
    ss.toast(
      "Initializing basic optimization with standard cleanup...",
      "Processing",
      -1
    );

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();
    const outputManager = new OutputManager(ss);

    // Force basic optimization
    routeOptimizer.useEnhancedOptimization = false;

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (!stores.length) {
      SpreadsheetApp.getUi().alert("No stores found for selected priorities.");
      return;
    }

    const startTime = new Date();
    const planResult = routeOptimizer.optimizePlan(stores);

    // Apply basic cleanup (without intelligent optimization)
    const cleanupResult = PostProcessingDeduplicator.cleanupFinalRoutes(
      planResult.workingDays
    );

    // For basic plan, use simpler consolidation (you can keep old method if you have it)
    // Or use intelligent consolidation but with simpler messaging
    const consolidationResult = PostProcessingDeduplicator.consolidateSmallDays(
      planResult.workingDays
    );

    const endTime = new Date();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    outputManager.createSheet(planResult, utilConfig, stores);

    const stats = planResult.statistics;
    let completionMessage = `✅ BASIC OPTIMIZATION COMPLETED in ${processingTime}s!\n\n`;
    completionMessage += `📊 Results:\n`;
    completionMessage += `• ${stats.totalStoresPlanned}/${stats.totalStoresRequired} stores planned (${stats.coveragePercentage}%)\n`;
    completionMessage += `• ${stats.workingDays} working days used\n`;
    completionMessage += `• ${stats.averageStoresPerDay} stores/day average\n`;
    completionMessage += `• ${stats.totalDistance}km total distance\n`;

    if (cleanupResult.cleanupStats.duplicatesRemoved > 0) {
      completionMessage += `• ${cleanupResult.cleanupStats.duplicatesRemoved} duplicates removed\n`;
    }
    if (consolidationResult.consolidationCount > 0) {
      completionMessage += `• ${consolidationResult.consolidationCount} days optimized\n`;
    }
    if (consolidationResult.p2StoresAdded > 0) {
      completionMessage += `• ${consolidationResult.p2StoresAdded} P2 stores added`;
    }

    Utils.log("=== BASIC OPTIMIZATION COMPLETED ===", "INFO");
    ss.toast(completionMessage, "✅ Success", 10);
  } catch (error) {
    Utils.log(
      "Error during basic plan generation: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
  }
}

// New test function for layered optimization
function testLayeredOptimization() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME
    );
    if (!sheet) {
      SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
      return;
    }

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (stores.length < 5) {
      SpreadsheetApp.getUi().alert(
        "Need at least 5 stores to test layered optimization."
      );
      return;
    }

    // Test with layered optimization
    const planResult = routeOptimizer.optimizePlan(stores);

    // Apply layered post-processing
    const cleanupResult = PostProcessingDeduplicator.cleanupFinalRoutes(
      planResult.workingDays
    );
    const consolidationResult = PostProcessingDeduplicator.consolidateSmallDays(
      planResult.workingDays
    );

    // Analyze results
    const minStores = 7; // Your specified minimum
    let underOptimizedDays = 0;
    let optimizedDays = 0;
    let emptyDays = 0;
    let totalStores = 0;

    planResult.workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        const storeCount = dayInfo.optimizedStores
          ? dayInfo.optimizedStores.length
          : 0;
        totalStores += storeCount;

        if (storeCount === 0) {
          emptyDays++;
        } else if (storeCount < minStores) {
          underOptimizedDays++;
        } else {
          optimizedDays++;
        }
      });
    });

    let message = "🎯 LAYERED OPTIMIZATION TEST RESULTS\n\n";
    message += `Day Distribution:\n`;
    message += `• Empty days: ${emptyDays}\n`;
    message += `• Under-optimized days (< ${minStores}): ${underOptimizedDays}\n`;
    message += `• Optimized days (≥ ${minStores}): ${optimizedDays}\n`;
    message += `• Total stores scheduled: ${totalStores}\n\n`;

    message += `Layered Consolidation Results:\n`;
    if (consolidationResult.layeredMetrics) {
      const layered = consolidationResult.layeredMetrics;
      message += `• P1 foundation days: ${layered.p1Foundation.daysCreated}\n`;
      message += `• P2 enhancement: ${layered.p2Enhancement.storesAdded} stores\n`;
      message += `• P3 enhancement: ${layered.p3Enhancement.storesAdded} stores\n`;
      message += `• Time violations: ${layered.finalValidation.timeViolations}\n`;
    }
    message += `• Days combined: ${consolidationResult.mergedDays}\n`;
    message += `• Total P2+P3 added: ${
      consolidationResult.p2StoresAdded +
      (consolidationResult.p3StoresAdded || 0)
    }\n\n`;

    message += `Cleanup Results:\n`;
    message += `• Duplicates removed: ${cleanupResult.cleanupStats.duplicatesRemoved}\n\n`;

    const successRate =
      (optimizedDays / (optimizedDays + underOptimizedDays + emptyDays)) * 100;
    if (successRate >= 80) {
      message += `✅ Layered optimization working well (${successRate.toFixed(
        1
      )}% success rate)\n`;
      message += `🎯 Algorithm: P1 Foundation → P2 Enhancement → P3 Enhancement → Time Validation`;
    } else {
      message += `⚠️ Optimization needs tuning (${successRate.toFixed(
        1
      )}% success rate)\n`;
      message += `💡 Consider adjusting P2/P3 frequencies or geographic parameters`;
    }

    SpreadsheetApp.getUi().alert("Layered Optimization Test", message);
  } catch (error) {
    Utils.log(
      "Error testing layered optimization: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert("Test failed: " + error.toString());
  }
}

function checkUtilizationOnly() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME
    );
    if (!sheet) {
      SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
      return;
    }

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const storeStats = storeManager.getStoreStatistics(
      utilConfig.includePriorities
    );

    let message = "📊 UTILIZATION ANALYSIS\n\n";
    message += `Selected Priorities: ${utilConfig.includePriorities.join(
      ", "
    )}\n`;
    message += `Current Utilization: ${utilConfig.utilization.toFixed(1)}%\n\n`;

    message += "📈 Store Statistics:\n";
    Object.entries(storeStats.byPriority).forEach(([priority, stats]) => {
      message += `${priority}: ${stats.scheduledStores}/${stats.totalStores} stores `;
      message += `(${Utils.formatFrequency(stats.frequency)})\n`;
    });

    message += `\nTotal: ${storeStats.totals.scheduledStores} stores scheduled for this month\n`;

    if (utilConfig.utilization > 100) {
      message += "\n⚠️ WARNING: Over 100% utilization!";
    } else if (utilConfig.utilization < 70) {
      message += "\n💡 LOW UTILIZATION: Consider adding more priorities.";
    } else {
      message += "\n✅ Utilization looks good for intelligent optimization.";
    }

    SpreadsheetApp.getUi().alert("Utilization Check", message);
  } catch (error) {
    Utils.log("Error checking utilization: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
  }
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("🚀 Route Optimizer - Layered")
    .addItem("🎯 Generate Layered Monthly Plan", "generateEnhancedMonthlyPlan")
    .addItem("📅 Generate Basic Monthly Plan", "generateBasicMonthlyPlan")
    .addSeparator()
    .addItem("📊 Check Utilization", "checkUtilizationOnly")
    .addItem("🧪 Test Layered Optimization", "testLayeredOptimization")
    .addToUi();

  Utils.log(
    "Route Optimizer with Layered Priority Optimization menu created",
    "INFO"
  );
}

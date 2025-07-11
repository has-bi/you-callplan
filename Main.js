// ==================== GEOGRAPHIC-FIRST MAIN ====================

function generateMonthlyPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
    return;
  }

  try {
    Utils.log(
      "=== STARTING GEOGRAPHIC-FIRST MONTHLY PLAN GENERATION ===",
      "INFO"
    );
    ss.toast("Reading configuration...", "Processing", -1);

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();
    const outputManager = new OutputManager(ss);

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();

    let toastMessage = `GEOGRAPHIC-FIRST ALGORITHM\nPriorities: ${utilConfig.includePriorities.join(
      ", "
    )} (${utilConfig.utilization.toFixed(1)}% utilization)`;
    toastMessage += `\nStrategy: Sort by coordinates → Fill days sequentially`;
    toastMessage += `\nTarget: ${CONFIG.CLUSTERING.TARGET_STORES_PER_DAY} stores/day, 14-day gaps`;

    if (CONFIG.CLUSTERING.MALL_DETECTION.ENABLE_MALL_CLUSTERING) {
      toastMessage += `\nMall clustering: ENABLED`;
    }

    ss.toast(toastMessage, "Processing", 4);

    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (!stores.length) {
      Utils.log("No stores found for selected priorities", "ERROR");
      SpreadsheetApp.getUi().alert(
        'No stores found for selected priorities. Please check visit frequencies are > 0 and stores have "YES" in shouldVisit column.'
      );
      return;
    }

    const storeStats = storeManager.getStoreStatistics(
      utilConfig.includePriorities
    );

    ss.toast(
      `Running GEOGRAPHIC-FIRST optimization on ${stores.length} stores (${storeStats.totals.expectedVisits} expected visits)...`,
      "Processing",
      -1
    );

    const planResult = routeOptimizer.optimizePlan(stores);
    outputManager.createSheet(planResult, utilConfig, stores);

    // Enhanced completion message
    const stats = planResult.statistics;
    let completionMessage = `✅ GEOGRAPHIC-FIRST COMPLETED!\n`;
    completionMessage += `📊 ${stats.totalStoresPlanned} visits planned (${stats.averageStoresPerDay} avg/day)`;

    if (stats.geographicOptimization) {
      const geoOpt = stats.geographicOptimization;
      completionMessage += `\n🗺️ Range: ${geoOpt.minStoresPerDay}-${geoOpt.maxStoresPerDay} stores/day`;
      completionMessage += `\n📈 Balance: ${geoOpt.balanceScore}% | Empty Days: ${geoOpt.emptyDays}`;
      completionMessage += `\n🎯 Utilization: ${geoOpt.utilizationRate}%`;
    }

    if (stats.multiVisitGaps) {
      completionMessage += `\n⏱️ 14-day Gap Compliance: ${stats.multiVisitGaps.gapCompliance}%`;
    }

    Utils.log(
      "=== GEOGRAPHIC-FIRST COMPLETED: " +
        stats.totalStoresPlanned +
        " visits, " +
        stats.averageStoresPerDay +
        " avg stores/day ===",
      "INFO"
    );

    ss.toast(completionMessage, "✅ Complete", 8);
  } catch (error) {
    Utils.log(
      "Error during geographic-first plan generation: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
    console.error(error);
  }
}

// NEW: Test geographic sorting
function testGeographicSorting() {
  try {
    Utils.log("Testing geographic sorting algorithm", "INFO");

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

    // Load stores for testing
    const stores = storeManager.loadStores(
      utilConfig.includePriorities.slice(0, 2)
    ); // P1, P2

    if (stores.length < 10) {
      SpreadsheetApp.getUi().alert(
        "Need at least 10 stores to test geographic sorting effectively."
      );
      return;
    }

    SpreadsheetApp.getUi().alert(
      "Testing geographic sorting...",
      "This may take 15-30 seconds",
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    // Test geographic sorting
    const routeOptimizer = new RouteOptimizer();
    const visitInstances = routeOptimizer.createVisitInstances(
      stores.slice(0, 30)
    );
    const sortedStores = routeOptimizer.geographicSort(visitInstances);

    let message = "GEOGRAPHIC SORTING TEST RESULTS\n\n";
    message += `Original stores: ${Math.min(30, stores.length)}\n`;
    message += `Sorted stores: ${sortedStores.length}\n`;
    message += `Sorting method: North→South, West→East (Lat/Lng grid)\n\n`;

    // Show geographic progression
    message += "GEOGRAPHIC PROGRESSION (First 10):\n";
    sortedStores.slice(0, 10).forEach((store, index) => {
      message += `${index + 1}. ${store.name} (${store.priority})\n`;
      message += `   Lat: ${store.lat.toFixed(4)}, Lng: ${store.lng.toFixed(
        4
      )}\n`;
    });

    if (sortedStores.length > 10) {
      message += `... and ${sortedStores.length - 10} more stores\n`;
    }

    // Analyze geographic spread
    const latRange =
      Math.max(...sortedStores.map((s) => s.lat)) -
      Math.min(...sortedStores.map((s) => s.lat));
    const lngRange =
      Math.max(...sortedStores.map((s) => s.lng)) -
      Math.min(...sortedStores.map((s) => s.lng));

    message += `\nGEOGRAPHIC SPREAD:\n`;
    message += `Latitude range: ${latRange.toFixed(4)} degrees\n`;
    message += `Longitude range: ${lngRange.toFixed(4)} degrees\n`;
    message += `Coverage area: ~${(latRange * lngRange * 12100).toFixed(
      1
    )} km²\n`;

    // Check if sorting created logical progression
    let goodProgression = 0;
    for (let i = 1; i < Math.min(10, sortedStores.length); i++) {
      const prevStore = sortedStores[i - 1];
      const currentStore = sortedStores[i];
      const distance = Utils.distance(
        prevStore.lat,
        prevStore.lng,
        currentStore.lat,
        currentStore.lng
      );

      if (distance <= 25) {
        // Within 25km = good progression
        goodProgression++;
      }
    }

    const progressionScore = Math.round(
      (goodProgression / Math.min(9, sortedStores.length - 1)) * 100
    );

    message += `\nPROGRESSION QUALITY:\n`;
    message += `Geographic continuity: ${progressionScore}%\n`;

    if (progressionScore >= 70) {
      message += `✅ EXCELLENT: Stores follow logical geographic progression`;
    } else if (progressionScore >= 50) {
      message += `⚠️ GOOD: Most stores follow geographic progression`;
    } else {
      message += `❌ POOR: Geographic sorting needs improvement`;
    }

    message += `\n\nNext step: This sorted list will be distributed sequentially to days (15 stores each).`;

    SpreadsheetApp.getUi().alert(
      "Geographic Sorting Test",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log("Error testing geographic sorting: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert(
      "Error",
      "Geographic sorting test failed: " + error.toString()
    );
  }
}

// NEW: Test sequential distribution
function testSequentialDistribution() {
  try {
    Utils.log("Testing sequential distribution", "INFO");

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
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (stores.length < 30) {
      SpreadsheetApp.getUi().alert(
        "Need at least 30 stores to test sequential distribution effectively."
      );
      return;
    }

    SpreadsheetApp.getUi().alert(
      "Testing sequential distribution...",
      "This may take 30-45 seconds",
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    // Test the process
    const routeOptimizer = new RouteOptimizer();
    const visitInstances = routeOptimizer.createVisitInstances(
      stores.slice(0, 60)
    );
    const sortedStores = routeOptimizer.geographicSort(visitInstances);
    const unassignedStores =
      routeOptimizer.distributeSequentially(sortedStores);

    let message = "SEQUENTIAL DISTRIBUTION TEST\n\n";
    message += `Total stores: ${sortedStores.length}\n`;
    message += `Assigned: ${sortedStores.length - unassignedStores.length}\n`;
    message += `Unassigned: ${unassignedStores.length}\n`;
    message += `Target per day: ${CONFIG.CLUSTERING.TARGET_STORES_PER_DAY}\n\n`;

    // Analyze distribution
    const dayDistribution = routeOptimizer.flatDays.map((day, index) => ({
      day: index + 1,
      stores: day.stores.length,
      dayName: day.dayName,
    }));

    const storesPerDay = dayDistribution.map((d) => d.stores);
    const maxStores = Math.max(...storesPerDay);
    const minStores = Math.min(...storesPerDay.filter((s) => s > 0));
    const emptyDays = storesPerDay.filter((s) => s === 0).length;
    const avgStores =
      storesPerDay.reduce((sum, count) => sum + count, 0) /
      dayDistribution.length;
    const balance =
      maxStores > 0 ? Math.round((minStores / maxStores) * 100) : 0;

    message += `DISTRIBUTION RESULTS:\n`;
    message += `• Average: ${avgStores.toFixed(1)} stores/day\n`;
    message += `• Range: ${
      minStores === Infinity ? 0 : minStores
    } - ${maxStores} stores\n`;
    message += `• Balance score: ${balance}%\n`;
    message += `• Empty days: ${emptyDays}/${dayDistribution.length}\n\n`;

    // Show first 10 days
    message += `FIRST 10 DAYS:\n`;
    dayDistribution.slice(0, 10).forEach((d) => {
      if (d.stores > 0) {
        message += `Day ${d.day} (${d.dayName}): ${d.stores} stores\n`;
      } else {
        message += `Day ${d.day} (${d.dayName}): EMPTY ❌\n`;
      }
    });

    // Evaluate success
    const targetRange = CONFIG.CLUSTERING.TARGET_STORES_PER_DAY;
    const withinTarget = storesPerDay.filter(
      (s) => s >= targetRange - 2 && s <= targetRange + 2
    ).length;
    const targetSuccess = Math.round(
      (withinTarget / dayDistribution.filter((d) => d.stores > 0).length) * 100
    );

    message += `\nTARGET ACHIEVEMENT:\n`;
    message += `Days within target range (${targetRange}±2): ${withinTarget}\n`;
    message += `Target success rate: ${targetSuccess}%\n`;

    if (avgStores >= targetRange * 0.8 && emptyDays <= 2) {
      message += `\n✅ SUCCESS: Sequential distribution working well!`;
    } else if (avgStores >= targetRange * 0.6) {
      message += `\n⚠️ PARTIAL: Distribution needs fine-tuning`;
    } else {
      message += `\n❌ ISSUE: Sequential distribution not achieving targets`;
    }

    SpreadsheetApp.getUi().alert(
      "Sequential Distribution Test",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log(
      "Error testing sequential distribution: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert(
      "Error",
      "Sequential distribution test failed: " + error.toString()
    );
  }
}

// NEW: Quick full algorithm test
function testFullGeographicAlgorithm() {
  try {
    Utils.log("Testing full geographic-first algorithm", "INFO");

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
    const stores = storeManager.loadStores(
      utilConfig.includePriorities.slice(0, 3)
    ); // P1, P2, P3

    if (stores.length < 20) {
      SpreadsheetApp.getUi().alert(
        "Need at least 20 stores to test full algorithm effectively."
      );
      return;
    }

    SpreadsheetApp.getUi().alert(
      "Testing full algorithm...",
      "This may take 45-60 seconds",
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    // Run full algorithm
    const routeOptimizer = new RouteOptimizer();
    const testResult = routeOptimizer.optimizePlan(stores.slice(0, 50));

    let message = "GEOGRAPHIC-FIRST ALGORITHM TEST\n\n";

    const stats = testResult.statistics;
    message += `Stores tested: ${Math.min(50, stores.length)}\n`;
    message += `Stores planned: ${stats.totalStoresPlanned}\n`;
    message += `Coverage: ${stats.coveragePercentage}%\n`;
    message += `Average stores/day: ${stats.averageStoresPerDay}\n`;
    message += `Average distance/day: ${stats.averageDistancePerDay}km\n\n`;

    if (stats.geographicOptimization) {
      const geoOpt = stats.geographicOptimization;
      message += `GEOGRAPHIC OPTIMIZATION:\n`;
      message += `• Algorithm: ${geoOpt.algorithm}\n`;
      message += `• Max stores/day: ${geoOpt.maxStoresPerDay}\n`;
      message += `• Min stores/day: ${geoOpt.minStoresPerDay}\n`;
      message += `• Empty days: ${geoOpt.emptyDays}/${geoOpt.totalDays}\n`;
      message += `• Balance score: ${geoOpt.balanceScore}%\n`;
      message += `• Day utilization: ${geoOpt.utilizationRate}%\n\n`;
    }

    if (stats.multiVisitGaps) {
      message += `MULTI-VISIT COMPLIANCE:\n`;
      message += `• Multi-visit stores: ${stats.multiVisitGaps.totalMultiVisitStores}\n`;
      message += `• 14-day gap compliance: ${stats.multiVisitGaps.gapCompliance}%\n`;
      message += `• Valid gaps: ${stats.multiVisitGaps.validGaps}/${stats.multiVisitGaps.totalGaps}\n\n`;
    }

    if (stats.mallStats && stats.mallStats.totalMallClusters > 0) {
      message += `MALL CLUSTERING:\n`;
      message += `• Mall clusters: ${stats.mallStats.totalMallClusters}\n`;
      message += `• Stores in malls: ${stats.mallStats.storesInMalls}\n`;
      message += `• Time savings: ${stats.mallStats.timeSavings} minutes\n\n`;
    }

    // Evaluate overall success
    const avgStores = parseFloat(stats.averageStoresPerDay);
    const coverage = parseFloat(stats.coveragePercentage);
    const balance = stats.geographicOptimization
      ? stats.geographicOptimization.balanceScore
      : 0;

    message += `OVERALL ASSESSMENT:\n`;
    if (avgStores >= 12 && coverage >= 80 && balance >= 70) {
      message += `✅ EXCELLENT: Algorithm achieving targets!`;
    } else if (avgStores >= 10 && coverage >= 70 && balance >= 60) {
      message += `⚠️ GOOD: Algorithm performing well with minor issues`;
    } else {
      message += `❌ NEEDS WORK: Algorithm not meeting targets`;
    }

    message += `\n\nGenerate full plan to see complete results with all stores.`;

    SpreadsheetApp.getUi().alert(
      "Geographic-First Algorithm Test",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log(
      "Error testing full geographic algorithm: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert(
      "Error",
      "Full algorithm test failed: " + error.toString()
    );
  }
}

// Existing utility functions
function checkUtilizationOnly() {
  try {
    Utils.log("Checking utilization configuration", "INFO");
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME
    );
    const utilManager = new UtilizationManager(sheet);
    const utilConfig = utilManager.getConfig();

    let message = `GEOGRAPHIC-FIRST UTILIZATION ANALYSIS\n\n`;
    message += `Current Utilization:\n`;

    Object.entries(utilConfig.allUtilizations)
      .map(function (entry) {
        return entry[0] + ": " + entry[1].toFixed(1) + "%";
      })
      .forEach((line) => (message += line + "\n"));

    message += `\nSelected: ${utilConfig.includePriorities.join(
      ", "
    )} (${utilConfig.utilization.toFixed(1)}%)\n\n`;
    message += `VISIT FREQUENCIES:\n`;

    Object.entries(utilConfig.visitFrequencies).forEach(function (entry) {
      const priority = entry[0];
      const frequency = entry[1];
      const included = utilConfig.includePriorities.includes(priority)
        ? "✅"
        : "❌";
      const status =
        frequency < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY
          ? "(Too low)"
          : frequency < 1
          ? "(Fractional)"
          : "(Regular)";

      message += `${priority}: ${Utils.formatFrequency(
        frequency
      )} ${included} ${status}\n`;
    });

    message += `\nGEOGRAPHIC-FIRST SETTINGS:\n`;
    message += `• Sorting method: North→South, West→East (Lat/Lng grid)\n`;
    message += `• Target stores/day: ${CONFIG.CLUSTERING.TARGET_STORES_PER_DAY}\n`;
    message += `• Max stores/day: ${CONFIG.CLUSTERING.MAX_STORES_PER_DAY}\n`;
    message += `• Multi-visit gaps: 14 days minimum\n`;
    message += `• Mall clustering: ${
      CONFIG.CLUSTERING.MALL_DETECTION.ENABLE_MALL_CLUSTERING
        ? "ENABLED ✅"
        : "DISABLED ❌"
    }\n\n`;
    message += `This simple approach sorts stores geographically then fills days sequentially.`;

    SpreadsheetApp.getUi().alert(
      "Geographic-First Analysis",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log("Error checking utilization: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert(
      "Error",
      error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

// ==================== ENHANCED MENU ====================
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("🗺️ Geographic-First Planner")
    .addItem("📅 Generate Monthly Plan", "generateMonthlyPlan")
    .addSeparator()
    .addItem("📊 Check Utilization", "checkUtilizationOnly")
    .addItem("🔍 Analyze Store Distribution", "analyzeStoreDistribution")
    .addSeparator()
    .addItem("🗺️ Test Geographic Sorting", "testGeographicSorting")
    .addItem("📋 Test Sequential Distribution", "testSequentialDistribution")
    .addItem("⚡ Test Full Algorithm", "testFullGeographicAlgorithm")
    .addSeparator()
    .addItem("🏬 Test Mall Detection", "testMallDetection")
    .addToUi();

  Utils.log("Geographic-First Route Planner menu created successfully", "INFO");
}

function onOpen_Alternative() {
  try {
    SpreadsheetApp.getActiveSpreadsheet().addMenu(
      "🗺️ Geographic-First Planner",
      [
        {
          name: "📅 Generate Monthly Plan",
          functionName: "generateMonthlyPlan",
        },
        null,
        { name: "📊 Check Utilization", functionName: "checkUtilizationOnly" },
        {
          name: "🔍 Analyze Store Distribution",
          functionName: "analyzeStoreDistribution",
        },
        null,
        {
          name: "🗺️ Test Geographic Sorting",
          functionName: "testGeographicSorting",
        },
        {
          name: "📋 Test Sequential Distribution",
          functionName: "testSequentialDistribution",
        },
        {
          name: "⚡ Test Full Algorithm",
          functionName: "testFullGeographicAlgorithm",
        },
        null,
        { name: "🏬 Test Mall Detection", functionName: "testMallDetection" },
      ]
    );

    console.log("Geographic-First menu created using alternative method");
  } catch (error) {
    console.error("Error creating menu:", error);
  }
}

function forceCreateMenu() {
  try {
    onOpen();
    SpreadsheetApp.getUi().alert("Geographic-First menu creation attempted!");
  } catch (error) {
    SpreadsheetApp.getUi().alert("Error creating menu: " + error.toString());
  }
}

function testScript() {
  console.log("Geographic-First script is working!");
  SpreadsheetApp.getUi().alert(
    "Geographic-First script ready! Simple coordinate-based routing."
  );
}

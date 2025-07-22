// ==================== ENHANCED OUTPUT MANAGER - CLEAN VERSION ====================
class OutputManager {
  constructor(ss) {
    this.ss = ss;
    this.dateCalculator = new DateCalculator();
  }

  // ==================== MAIN SHEET CREATION METHODS ====================

  createEnhancedSheet(planResult, utilConfig, allStores) {
    const sheetName = this.generateSheetName("Enhanced MY Callplan");
    const sheet = this.createOrClearSheet(sheetName);

    this.writeEnhancedContent(sheet, planResult, utilConfig);
    this.formatEnhancedSheet(sheet);
  }

  createSheet(planResult, utilConfig, allStores) {
    const sheetName = this.generateSheetName("MY Callplan");
    const sheet = this.createOrClearSheet(sheetName);

    this.writeContent(sheet, planResult, utilConfig);
    this.formatStandardSheet(sheet);
  }

  // ==================== CONTENT WRITING METHODS ====================

  writeEnhancedContent(sheet, planResult, utilConfig) {
    const {
      workingDays,
      unvisitedStores,
      statistics,
      p1VisitFrequency,
      hasW5,
      gridAnalysis,
      performance,
    } = planResult;

    let row = this.writeEnhancedHeader(sheet);
    row = this.writeEnhancedSummary(
      sheet,
      row,
      statistics,
      utilConfig,
      p1VisitFrequency,
      hasW5,
      gridAnalysis,
      performance
    );
    row = this.writeEnhancedWeeklyRoutes(sheet, row, workingDays);
    this.writeUnvisitedStores(sheet, row, unvisitedStores);
  }

  writeContent(sheet, planResult, utilConfig) {
    const {
      workingDays,
      unvisitedStores,
      statistics,
      p1VisitFrequency,
      hasW5,
    } = planResult;

    let row = this.writeHeader(sheet);
    row = this.writeSummary(
      sheet,
      row,
      statistics,
      utilConfig,
      p1VisitFrequency,
      hasW5
    );
    row = this.writeWeeklyRoutes(sheet, row, workingDays);
    this.writeUnvisitedStores(sheet, row, unvisitedStores);
  }

  // ==================== HEADER METHODS ====================

  writeEnhancedHeader(sheet) {
    sheet
      .getRange(1, 1)
      .setValue(
        "ENHANCED MONTHLY ROUTE PLAN - CROSS-BORDER GRID OPTIMIZATION v2.0"
      )
      .setFontSize(16)
      .setFontWeight("bold")
      .setBackground("#1976d2")
      .setFontColor("white");

    sheet.getRange(1, 10).setValue(new Date().toLocaleString("en-MY"));
    return 3;
  }

  writeHeader(sheet) {
    sheet
      .getRange(1, 1)
      .setValue("MONTHLY ROUTE PLAN - GEOGRAPHIC OPTIMIZATION")
      .setFontSize(16)
      .setFontWeight("bold");

    sheet.getRange(1, 9).setValue(new Date().toLocaleString("en-MY"));
    return 3;
  }

  // ==================== SUMMARY METHODS ====================

  writeEnhancedSummary(
    sheet,
    row,
    statistics,
    utilConfig,
    p1VisitFrequency,
    hasW5,
    gridAnalysis,
    performance
  ) {
    const summaryData = this.buildEnhancedSummaryData(
      statistics,
      utilConfig,
      p1VisitFrequency,
      hasW5,
      gridAnalysis,
      performance
    );

    this.writeSectionHeader(sheet, row, "EXECUTIVE SUMMARY", "#e3f2fd");
    sheet.getRange(row + 1, 1, summaryData.length, 2).setValues(summaryData);

    return row + summaryData.length + 3;
  }

  writeSummary(sheet, row, statistics, utilConfig, p1VisitFrequency, hasW5) {
    const summaryData = this.buildStandardSummaryData(
      statistics,
      utilConfig,
      p1VisitFrequency,
      hasW5
    );

    this.writeSectionHeader(sheet, row, "EXECUTIVE SUMMARY", "#e3f2fd");
    sheet.getRange(row + 1, 1, summaryData.length, 2).setValues(summaryData);

    return row + summaryData.length + 3;
  }

  // ==================== WEEKLY ROUTES METHODS ====================

  writeEnhancedWeeklyRoutes(sheet, row, workingDays) {
    workingDays.forEach((week, weekIdx) => {
      row = this.writeEnhancedWeekHeader(sheet, row, week, weekIdx);
      row = this.writeWeekDays(sheet, row, week, true); // true = enhanced mode
      row++;
    });
    return row;
  }

  writeWeeklyRoutes(sheet, row, workingDays) {
    workingDays.forEach((week, weekIdx) => {
      row = this.writeWeekHeader(sheet, row, week, weekIdx);
      row = this.writeWeekDays(sheet, row, week, false); // false = standard mode
      row++;
    });
    return row;
  }

  writeWeekDays(sheet, row, week, isEnhanced) {
    week.forEach((dayInfo) => {
      if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
        row = isEnhanced
          ? this.writeEnhancedDayRoute(
              sheet,
              row,
              dayInfo.optimizedStores,
              dayInfo
            )
          : this.writeDayRoute(sheet, row, dayInfo.optimizedStores, dayInfo);
      } else {
        row = this.writeEmptyDay(sheet, row, dayInfo);
      }
    });
    return row;
  }

  // ==================== WEEK HEADER METHODS ====================

  writeEnhancedWeekHeader(sheet, row, week, weekIdx) {
    const weekStats = this.calculateWeekStats(week);

    this.writeSectionHeader(sheet, row, `WEEK ${weekIdx + 1}`, "#e8f5e9");

    const weekSummary = `${
      weekStats.stores
    } visits, ${weekStats.distance.toFixed(1)} km | ${
      weekStats.activeDays
    }/5 days, ${weekStats.utilization}% avg utilization`;

    sheet.getRange(row, 7).setValue(weekSummary).setFontSize(11);
    return row + 2;
  }

  writeWeekHeader(sheet, row, week, weekIdx) {
    const weekStats = this.calculateWeekStats(week);
    const multiVisitStores = this.countMultiVisitStores(week);

    this.writeSectionHeader(sheet, row, `WEEK ${weekIdx + 1}`, "#e8f5e9");

    const weekSummary = `${
      weekStats.stores
    } visits, ${weekStats.distance.toFixed(1)} km | ${
      weekStats.activeDays
    }/5 days used`;

    sheet.getRange(row, 7).setValue(weekSummary).setFontSize(11);

    if (multiVisitStores > 0) {
      row++;
      sheet
        .getRange(row, 7)
        .setValue(`Multi-visit stores: ${multiVisitStores}`)
        .setFontStyle("italic")
        .setFontSize(9)
        .setFontColor("#d32f2f");
    }

    return row + 2;
  }

  // ==================== DAY ROUTE METHODS ====================

  writeEnhancedDayRoute(sheet, row, day, dayInfo) {
    const dayStats = this.calculateDayStats(day);
    const utilization = dayInfo.utilization || day.length / 13;

    // Write day header (without cross-border info display)
    row = this.writeDayHeader(sheet, row, dayInfo, dayStats, utilization, true);

    // Write store details (standard mode - no grid info or type columns)
    return this.writeStoreDetails(sheet, row, day, false);
  }

  writeDayRoute(sheet, row, day, dayInfo) {
    const dayStats = this.calculateDayStats(day);
    const multiVisitStores = day.filter((store) => store.isMultiVisit);

    // Write day header
    row = this.writeDayHeader(sheet, row, dayInfo, dayStats, null, false);

    // Write additional info for standard mode
    if (dayStats.retailerSummary) {
      sheet
        .getRange(row - 1, 8)
        .setValue("Retailers: " + dayStats.retailerSummary)
        .setFontStyle("italic")
        .setFontSize(9);
    }

    if (multiVisitStores.length > 0) {
      sheet
        .getRange(row - 1, 9)
        .setValue(`${multiVisitStores.length} multi-visit`)
        .setFontStyle("italic")
        .setFontSize(9)
        .setBackground("#ffe0b2");
    }

    // Write store details
    return this.writeStoreDetails(sheet, row, day, false);
  }

  writeDayHeader(sheet, row, dayInfo, dayStats, utilization, isEnhanced) {
    const dayName =
      dayInfo.dayName + " - " + this.dateCalculator.formatDate(dayInfo.date);

    sheet
      .getRange(row, 1)
      .setValue(dayName)
      .setFontWeight("bold")
      .setBackground("#f5f5f5");

    sheet.getRange(row, 3).setValue(dayStats.storeCount + " stores");
    sheet.getRange(row, 4).setValue(dayStats.distance.toFixed(1) + " km");
    sheet.getRange(row, 5).setValue(Math.round(dayStats.duration) + " min");
    sheet
      .getRange(row, 6)
      .setValue("Districts: " + dayStats.districts.join(", "))
      .setFontStyle("italic");

    // Enhanced mode utilization with color coding
    if (isEnhanced && utilization !== null) {
      this.setUtilizationDisplay(
        sheet,
        row,
        utilization,
        dayStats.hasTimeViolations
      );
    }

    return row + 1;
  }

  writeStoreDetails(sheet, row, day, isEnhanced) {
    const headers = [
      "#",
      "No.Str",
      "Store Name",
      "Retailer",
      "District",
      "Priority",
      "Navigation",
      "Arrival",
      "Depart",
      "Distance",
      "Travel",
      "Visit Info",
    ];

    sheet
      .getRange(row, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold")
      .setFontSize(10);
    row++;

    day.forEach((store, index) => {
      const storeData = this.buildStoreRowData(store, index, day, isEnhanced);
      sheet.getRange(row, 1, 1, storeData.length).setValues([storeData]);
      this.applyStoreRowFormatting(sheet, row, store, storeData.length);
      row++;
    });

    return row + 1;
  }

  writeEmptyDay(sheet, row, dayInfo) {
    const dayName =
      dayInfo.dayName + " - " + this.dateCalculator.formatDate(dayInfo.date);

    sheet
      .getRange(row, 1)
      .setValue(dayName)
      .setFontWeight("bold")
      .setBackground("#ffcdd2");

    sheet
      .getRange(row, 3)
      .setValue("❌ NO STORES SCHEDULED")
      .setFontStyle("italic")
      .setFontWeight("bold")
      .setFontColor("#d32f2f");

    return row + 2;
  }

  // ==================== UNVISITED STORES METHOD ====================

  writeUnvisitedStores(sheet, row, unvisitedStores) {
    if (!unvisitedStores || !unvisitedStores.length) return;

    row++;
    this.writeSectionHeader(
      sheet,
      row,
      "STORES NOT COVERED THIS MONTH",
      "#ffcdd2"
    );
    row++;

    const categorized = this.categorizeUnvisitedStores(unvisitedStores);

    sheet
      .getRange(row, 1)
      .setValue(
        `Total: ${unvisitedStores.length} stores not scheduled (${categorized.fractional.length} fractional, ${categorized.regular.length} regular, ${categorized.multiVisit.length} multi-visit)`
      )
      .setFontColor("#d32f2f");
    row += 2;

    row = this.writeUnvisitedReasons(sheet, row);
    row = this.writeUnvisitedByCategory(sheet, row, categorized);
    this.writeUnvisitedDetails(sheet, row, categorized.regular);
  }

  // ==================== HELPER METHODS ====================

  generateSheetName(prefix) {
    const currentDate = new Date();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return `${prefix} - ${monthNames[currentDate.getMonth()]}`;
  }

  createOrClearSheet(sheetName) {
    let sheet;
    try {
      sheet = this.ss.insertSheet(sheetName);
      Utils.log("Created new sheet: " + sheetName, "INFO");
    } catch (e) {
      sheet = this.ss.getSheetByName(sheetName);
      sheet.clear();
      Utils.log("Cleared existing sheet: " + sheetName, "INFO");
    }
    return sheet;
  }

  formatEnhancedSheet(sheet) {
    sheet.autoResizeColumns(1, 12);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(7, 200);
  }

  formatStandardSheet(sheet) {
    sheet.autoResizeColumns(1, 12);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(7, 200);
  }

  writeSectionHeader(sheet, row, title, backgroundColor) {
    sheet
      .getRange(row, 1)
      .setValue(title)
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground(backgroundColor);
  }

  setUtilizationDisplay(sheet, row, utilization, hasTimeViolations) {
    const utilizationText = Math.round(utilization * 100) + "% capacity";
    const utilizationRange = sheet.getRange(row, 7);
    utilizationRange.setValue(utilizationText);

    if (hasTimeViolations) {
      utilizationRange.setBackground("#f44336").setFontColor("white");
    } else if (utilization >= 0.95) {
      utilizationRange.setBackground("#4caf50").setFontColor("white");
    } else if (utilization >= 0.8) {
      utilizationRange.setBackground("#8bc34a");
    } else if (utilization >= 0.6) {
      utilizationRange.setBackground("#ffeb3b");
    } else {
      utilizationRange.setBackground("#ff9800").setFontColor("white");
    }
  }

  applyStoreRowFormatting(sheet, row, store, columnCount) {
    if (store.isAfter6PM || store.timeWarning) {
      sheet
        .getRange(row, 1, 1, columnCount)
        .setBackground("#ffcdd2")
        .setFontColor("#d32f2f");
    } else if (store.isFractionalVisit) {
      sheet.getRange(row, 1, 1, columnCount).setBackground("#fff3e0");
    } else if (store.isMultiVisit) {
      sheet.getRange(row, 1, 1, columnCount).setBackground("#ffe0b2");
    } else if (store.mallClusterId) {
      sheet.getRange(row, 1, 1, columnCount).setBackground("#e8f5e9");
    }
  }

  // ==================== DATA CALCULATION METHODS ====================

  buildEnhancedSummaryData(
    statistics,
    utilConfig,
    p1VisitFrequency,
    hasW5,
    gridAnalysis,
    performance
  ) {
    const baseData = this.buildBaseSummaryData(
      statistics,
      utilConfig,
      p1VisitFrequency,
      hasW5
    );

    // Only add geographic optimization if no cross-border optimization
    if (
      statistics.geographicOptimization &&
      !statistics.crossBorderOptimization
    ) {
      baseData.push(
        ...this.buildGeographicOptimizationData(
          statistics.geographicOptimization
        )
      );
    }

    return baseData;
  }

  buildStandardSummaryData(statistics, utilConfig, p1VisitFrequency, hasW5) {
    const baseData = this.buildBaseSummaryData(
      statistics,
      utilConfig,
      p1VisitFrequency,
      hasW5
    );

    if (statistics.twoPhaseOptimization) {
      baseData.push(...this.buildTwoPhaseData(statistics.twoPhaseOptimization));
    }

    if (statistics.multiVisitGaps) {
      baseData.push(...this.buildMultiVisitData(statistics.multiVisitGaps));
    }

    if (statistics.mallStats) {
      baseData.push(...this.buildMallStatsData(statistics.mallStats));
    }

    if (statistics.retailerCounts) {
      baseData.push(...this.buildRetailerData(statistics.retailerCounts));
    }

    return baseData;
  }

  buildBaseSummaryData(statistics, utilConfig, p1VisitFrequency, hasW5) {
    return [
      ["Total Stores to Visit:", statistics.totalStoresRequired],
      ["Stores Planned:", statistics.totalStoresPlanned],
      ["Coverage:", statistics.coveragePercentage + "%"],
      ["Working Days Used:", statistics.workingDays],
      ["Average Stores/Day:", statistics.averageStoresPerDay],
      ["Total Distance:", statistics.totalDistance + " km"],
      ["Selected Priorities:", utilConfig.includePriorities.join(", ")],
      ["P1 Visit Frequency:", Utils.formatFrequency(p1VisitFrequency)],
      ["Utilization:", utilConfig.utilization.toFixed(1) + "%"],
    ];
  }

  buildCrossBorderData(crossBorderStats, performance) {
    const data = [
      ["", ""],
      ["CROSS-BORDER OPTIMIZATION RESULTS:", ""],
      ["Algorithm:", "Grid-Based Cross-Border System"],
      ["Efficiency Gain:", crossBorderStats.efficiencyGain],
      ["Average Utilization:", crossBorderStats.avgUtilization],
      ["Cross-Border Days:", crossBorderStats.crossBorderDays],
      ["Days Reduction:", crossBorderStats.daysReduction],
    ];

    if (performance && performance.timeComplianceRate !== undefined) {
      data.push([
        "Time Compliance Rate:",
        performance.timeComplianceRate + "% (end by 6:20 PM)",
      ]);
      if (performance.averageEndTime) {
        data.push([
          "Average End Time:",
          Utils.formatTime(performance.averageEndTime),
        ]);
      }
    }

    data.push(
      ["", ""],
      ["GRID ANALYSIS (BEFORE):", ""],
      [
        "Underutilized Grids:",
        crossBorderStats.beforeOptimization.underutilized,
      ],
      ["Optimal Grids:", crossBorderStats.beforeOptimization.optimal],
      ["Overloaded Grids:", crossBorderStats.beforeOptimization.overloaded],
      ["", ""],
      ["OPTIMIZATION BREAKDOWN:", ""],
      ["Standalone Days:", crossBorderStats.afterOptimization.standaloneDays],
      [
        "Cross-Border Days:",
        crossBorderStats.afterOptimization.crossBorderDays,
      ],
      ["Split Days:", crossBorderStats.afterOptimization.splitDays]
    );

    return data;
  }

  buildBusinessImpactData(businessImpact) {
    return [
      ["", ""],
      ["BUSINESS IMPACT:", ""],
      ["Travel Days Saved:", businessImpact.travelDaysReduced + " days/month"],
      ["Utilization Improvement:", businessImpact.utilizationImprovement],
      ["Monthly Cost Savings:", businessImpact.estimatedCostSavings.monthly],
      ["Annual Cost Savings:", businessImpact.estimatedCostSavings.annual],
      ["Time Savings per Week:", businessImpact.timeSavingsPerWeek],
    ];
  }

  buildGeographicOptimizationData(geoOptimization) {
    return [
      ["", ""],
      ["GEOGRAPHIC OPTIMIZATION:", ""],
      ["Algorithm:", geoOptimization.algorithm],
      ["Balance Score:", geoOptimization.balanceScore + "%"],
      ["Day Utilization:", geoOptimization.utilizationRate + "%"],
      ["Empty Days:", geoOptimization.emptyDays],
    ];
  }

  buildTwoPhaseData(twoPhase) {
    return [
      ["", ""],
      ["TWO-PHASE OPTIMIZATION:", ""],
      ["Max Stores/Day:", twoPhase.maxStoresPerDay],
      ["Min Stores/Day:", twoPhase.minStoresPerDay],
      ["Empty Days:", twoPhase.emptyDays],
      ["Day Utilization:", twoPhase.utilizationRate + "%"],
      ["Balance Score:", twoPhase.balanceScore + "% (higher = more balanced)"],
      ["Phase 1:", twoPhase.phase1_AggressiveAssignment],
      ["Phase 2:", twoPhase.phase2_MultiVisitRebalancing],
      ["Phase 3:", twoPhase.phase3_FineTuning],
    ];
  }

  buildMultiVisitData(multiVisit) {
    return [
      ["", ""],
      ["MULTI-VISIT GAP COMPLIANCE:", ""],
      ["Multi-visit Stores:", multiVisit.totalMultiVisitStores],
      ["7-Day Gap Compliance:", multiVisit.gapCompliance + "%"],
      ["Valid Gaps:", multiVisit.validGaps + "/" + multiVisit.totalGaps],
    ];
  }

  buildMallStatsData(mallStats) {
    return [
      ["", ""],
      ["MALL CLUSTERING RESULTS:", ""],
      ["Mall Clusters Detected:", mallStats.totalMallClusters],
      ["Stores in Mall Clusters:", mallStats.storesInMalls],
      ["Average Stores per Mall:", mallStats.avgStoresPerMall],
      ["Mall Clustering Efficiency:", mallStats.clusteringEfficiency + "%"],
      ["Travel Time Savings:", mallStats.timeSavings + " minutes"],
    ];
  }

  buildRetailerData(retailerCounts) {
    const data = [
      ["", ""],
      ["RETAILER BREAKDOWN:", ""],
    ];
    Object.entries(retailerCounts).forEach(([retailer, count]) => {
      data.push([`${retailer}:`, count + " stores"]);
    });
    return data;
  }

  calculateWeekStats(week) {
    const stores = week.reduce(
      (sum, dayInfo) =>
        sum + (dayInfo.optimizedStores ? dayInfo.optimizedStores.length : 0),
      0
    );
    const distance = week.reduce((sum, dayInfo) => {
      if (dayInfo.optimizedStores) {
        return (
          sum +
          dayInfo.optimizedStores.reduce(
            (daySum, store) => daySum + (store.distance || 0),
            0
          )
        );
      }
      return sum;
    }, 0);
    const activeDays = week.filter(
      (dayInfo) => dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0
    ).length;
    const utilization =
      activeDays > 0 ? Math.round((stores / (activeDays * 13)) * 100) : 0;

    return { stores, distance, activeDays, utilization };
  }

  calculateDayStats(day) {
    const storeCount = day.length;
    const distance = day.reduce((sum, store) => sum + (store.distance || 0), 0);
    const duration = day.reduce(
      (sum, store) =>
        sum + (store.duration || 0) + CONFIG.BUFFER_TIME + store.visitTime,
      0
    );
    const districts = [...new Set(day.map((s) => s.district))];
    const hasTimeViolations = day.some(
      (store) => store.isAfter6PM || store.timeWarning
    );

    const retailerCounts = {};
    day.forEach((store) => {
      const retailer = this.normalizeRetailerName(store.retailer);
      retailerCounts[retailer] = (retailerCounts[retailer] || 0) + 1;
    });

    const retailerSummary = Object.entries(retailerCounts)
      .filter(([retailer, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([retailer, count]) => `${retailer}: ${count}`)
      .join(", ");

    return {
      storeCount,
      distance,
      duration,
      districts,
      hasTimeViolations,
      retailerSummary,
    };
  }

  countCrossBorderDays(week) {
    return week.filter(
      (dayInfo) => dayInfo.crossBorderInfo && dayInfo.crossBorderInfo.count > 0
    ).length;
  }

  countMultiVisitStores(week) {
    return week.reduce((sum, dayInfo) => {
      if (dayInfo.optimizedStores) {
        return (
          sum +
          dayInfo.optimizedStores.filter((store) => store.isMultiVisit).length
        );
      }
      return sum;
    }, 0);
  }

  calculateWeekMallStats(week) {
    const mallClusters = new Set();
    let storesInMalls = 0;

    week.forEach((dayInfo) => {
      if (dayInfo.optimizedStores) {
        dayInfo.optimizedStores.forEach((store) => {
          if (store.mallClusterId) {
            mallClusters.add(store.mallClusterId);
            storesInMalls++;
          }
        });
      }
    });

    return {
      mallClusters: mallClusters.size,
      storesInMalls: storesInMalls,
      totalStores: week.reduce(
        (sum, dayInfo) =>
          sum + (dayInfo.optimizedStores ? dayInfo.optimizedStores.length : 0),
        0
      ),
    };
  }

  calculateDayMallInfo(day) {
    const mallClusters = {};
    let mallStores = 0;

    day.forEach((store) => {
      if (store.mallClusterId) {
        if (!mallClusters[store.mallClusterId]) {
          mallClusters[store.mallClusterId] = {
            stores: [],
            priorities: new Set(),
          };
        }
        mallClusters[store.mallClusterId].stores.push(store);
        mallClusters[store.mallClusterId].priorities.add(store.priority);
        mallStores++;
      }
    });

    const mallCount = Object.keys(mallClusters).length;
    if (mallCount === 0) {
      return { summary: null };
    }

    const mallSummaries = Object.entries(mallClusters).map(([mallId, info]) => {
      const priorityList = Array.from(info.priorities).sort().join(",");
      return `${info.stores.length} stores (${priorityList})`;
    });

    return {
      summary: `${mallCount} malls: ${mallSummaries.join(" | ")}`,
      mallCount,
      mallStores,
      details: mallClusters,
    };
  }

  buildStoreRowData(store, index, day, isEnhanced) {
    const { fromLat, fromLng, linkText } = this.getNavigationInfo(day, index);
    const mapsUrl = Utils.mapsLink(fromLat, fromLng, store.lat, store.lng);

    return [
      store.order || index + 1,
      store.noStr || "",
      store.name,
      store.retailer || "",
      store.district,
      store.priority,
      '=HYPERLINK("' + mapsUrl + '", "' + linkText + '")',
      Utils.formatTime(store.arrivalTime || 0),
      Utils.formatTime(store.departTime || 0),
      (store.distance || 0).toFixed(1) + " km",
      (store.duration || 0) + " min",
      this.formatVisitInfo(store),
    ];
  }

  categorizeUnvisitedStores(unvisitedStores) {
    return {
      fractional: unvisitedStores.filter(
        (s) => s.baseFrequency && s.baseFrequency < 1
      ),
      regular: unvisitedStores.filter(
        (s) => !s.baseFrequency || s.baseFrequency >= 1
      ),
      multiVisit: unvisitedStores.filter((s) => s.isMultiVisit),
    };
  }

  writeUnvisitedReasons(sheet, row) {
    sheet
      .getRange(row, 1)
      .setValue("POSSIBLE REASONS FOR UNVISITED STORES:")
      .setFontWeight("bold");
    row++;

    const reasons = [
      "• Day capacity limits (13 stores/day max)",
      "• Time constraints (must finish by 6:20 PM)",
      "• Geographic clustering efficiency",
      "• Cross-border optimization constraints",
      "• 7-day gap requirements for multi-visit stores",
      "• Fractional frequency probability distribution",
    ];

    reasons.forEach((reason) => {
      sheet.getRange(row, 1).setValue(reason);
      row++;
    });

    return row + 1;
  }

  writeUnvisitedByCategory(sheet, row, categorized) {
    // Fractional stores
    if (categorized.fractional.length > 0) {
      this.writeSectionHeader(
        sheet,
        row,
        "FRACTIONAL FREQUENCY STORES (Expected - will appear in future months)",
        "#fff3e0"
      );
      row++;

      const fractionalByPriority = this.groupByPriority(categorized.fractional);
      Object.entries(fractionalByPriority).forEach(([priority, stores]) => {
        const frequency = stores[0]?.baseFrequency || 0;
        sheet
          .getRange(row, 1)
          .setValue(
            `${priority}: ${stores.length} stores (${Utils.formatFrequency(
              frequency
            )})`
          );
        row++;
      });
      row++;
    }

    // Regular stores
    if (categorized.regular.length > 0) {
      this.writeSectionHeader(
        sheet,
        row,
        "REGULAR STORES (Could not fit in optimized schedule)",
        "#ffcdd2"
      );
      row++;

      const regularByPriority = this.groupByPriority(categorized.regular);
      Object.entries(regularByPriority).forEach(([priority, stores]) => {
        sheet.getRange(row, 1).setValue(`${priority}: ${stores.length} stores`);
        row++;
      });
      row++;
    }

    return row;
  }

  writeUnvisitedDetails(sheet, row, regularUnvisited) {
    if (regularUnvisited.length === 0) return;

    const headers = [
      "Store Name",
      "No.Str",
      "Retailer",
      "District",
      "Priority",
      "Frequency",
      "Address",
      "Visit Type",
    ];
    sheet
      .getRange(row, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold");
    row++;

    const displayCount = Math.min(20, regularUnvisited.length);
    for (let i = 0; i < displayCount; i++) {
      const store = regularUnvisited[i];
      const data = [
        store.name,
        store.noStr || "",
        store.retailer || "",
        store.district,
        store.priority,
        this.formatStoreFrequency(store),
        this.formatAddress(store.address),
        this.getVisitType(store),
      ];

      sheet.getRange(row, 1, 1, data.length).setValues([data]);
      this.applyUnvisitedStoreFormatting(sheet, row, store, data.length);
      row++;
    }

    if (regularUnvisited.length > displayCount) {
      row++;
      sheet
        .getRange(row, 1)
        .setValue(
          `... and ${regularUnvisited.length - displayCount} more stores`
        )
        .setFontStyle("italic");
    }
  }

  // ==================== FORMATTING HELPER METHODS ====================

  formatOptimizationType(optimizationType) {
    const typeText = optimizationType.replace(/_/g, " ").toLowerCase();
    return typeText.charAt(0).toUpperCase() + typeText.slice(1);
  }

  formatStoreFrequency(store) {
    if (store.baseFrequency) {
      return store.baseFrequency < 1
        ? store.baseFrequency.toFixed(2)
        : store.baseFrequency.toString();
    }
    return (store.visits || 0).toString();
  }

  formatAddress(address) {
    if (!address) return "";
    return address.length > 40 ? address.substring(0, 40) + "..." : address;
  }

  getVisitType(store) {
    if (store.isMultiVisit) return "Multi-visit";
    if (store.isFractionalVisit) return "Fractional";
    return "Regular";
  }

  applyUnvisitedStoreFormatting(sheet, row, store, columnCount) {
    if (store.isMultiVisit) {
      sheet.getRange(row, 1, 1, columnCount).setBackground("#ffe0b2");
    } else {
      sheet.getRange(row, 1, 1, columnCount).setBackground("#ffebee");
    }
  }

  groupByPriority(stores) {
    const grouped = {};
    stores.forEach((store) => {
      if (!grouped[store.priority]) {
        grouped[store.priority] = [];
      }
      grouped[store.priority].push(store);
    });
    return grouped;
  }

  // ==================== STORE INFORMATION METHODS ====================

  getNavigationInfo(day, index) {
    if (index === 0) {
      return {
        fromLat: CONFIG.START.LAT,
        fromLng: CONFIG.START.LNG,
        linkText: "From Start",
      };
    }

    const prevStore = day[index - 1];
    return {
      fromLat: prevStore.lat,
      fromLng: prevStore.lng,
      linkText: `From ${prevStore.name.substring(0, 15)}...`,
    };
  }

  determineStoreType(store, day) {
    // Check if this store is likely from cross-border optimization
    // This is a simplified check - could be enhanced with actual grid tracking
    return store.gridKey && store.gridKey !== day[0]?.gridKey
      ? "Cross-border"
      : "Primary grid";
  }

  formatVisitInfo(store) {
    if (store.isMultiVisit) {
      return `Visit ${store.visitNum}/${store.actualVisits || 1}`;
    }
    if (store.isFractionalVisit) {
      return `Fractional (${(store.baseFrequency || 0).toFixed(2)})`;
    }
    return "Regular";
  }

  formatStoreMallInfo(store, previousStore) {
    if (!store.mallClusterId) {
      return "Individual";
    }

    const mallInfo = store.mallClusterInfo || {};
    let info = `Mall (${mallInfo.storeCount || "?"} stores)`;

    if (previousStore && previousStore.mallClusterId === store.mallClusterId) {
      info += " - Walk";
    } else {
      info += " - Drive";
    }

    return info;
  }

  normalizeRetailerName(retailer) {
    if (!retailer) return "Unknown";

    const normalized = retailer.toString().toLowerCase().trim();

    if (normalized.includes("watson") || normalized.includes("watsons")) {
      return "Watsons";
    }
    if (normalized.includes("guardian")) {
      return "Guardian";
    }
    if (normalized.includes("health") && normalized.includes("line")) {
      return "Health Line";
    }
    if (normalized.includes("caring")) {
      return "Caring";
    }

    return retailer.toString().trim();
  }
}

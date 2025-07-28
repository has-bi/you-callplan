// ==================== OUTPUT MANAGER - SIMPLIFIED ====================
class OutputManager {
  constructor(ss) {
    this.ss = ss;
    this.dateCalculator = new DateCalculator();
  }

  // Main sheet creation methods
  createEnhancedSheet(planResult, utilConfig, allStores) {
    const sheetName = this.generateSheetName("Enhanced MY Callplan");
    const sheet = this.createOrClearSheet(sheetName);
    this.writeContent(sheet, planResult, utilConfig, true);
    this.formatSheet(sheet);
  }

  createSheet(planResult, utilConfig, allStores) {
    const sheetName = this.generateSheetName("MY Callplan");
    const sheet = this.createOrClearSheet(sheetName);
    this.writeContent(sheet, planResult, utilConfig, false);
    this.formatSheet(sheet);
  }

  // Write content to sheet
  writeContent(sheet, planResult, utilConfig, isEnhanced) {
    const {
      workingDays,
      unvisitedStores,
      statistics,
      p1VisitFrequency,
      hasW5,
    } = planResult;

    let row = 1;

    // Header
    const title = isEnhanced
      ? "ENHANCED MONTHLY ROUTE PLAN - FIXED"
      : "MONTHLY ROUTE PLAN - FIXED";
    sheet
      .getRange(row, 1)
      .setValue(title)
      .setFontSize(16)
      .setFontWeight("bold");
    sheet.getRange(row, 9).setValue(new Date().toLocaleString("en-MY"));
    row += 2;

    // Summary
    const summaryData = this.buildSummaryData(
      statistics,
      utilConfig,
      p1VisitFrequency,
      hasW5
    );
    sheet
      .getRange(row, 1)
      .setValue("EXECUTIVE SUMMARY")
      .setFontSize(14)
      .setFontWeight("bold");
    row++;
    sheet.getRange(row, 1, summaryData.length, 2).setValues(summaryData);
    row += summaryData.length + 2;

    // Weekly routes
    workingDays.forEach((week, weekIdx) => {
      row = this.writeWeek(sheet, row, week, weekIdx);
    });

    // Unvisited stores
    if (unvisitedStores && unvisitedStores.length > 0) {
      this.writeUnvisitedStores(sheet, row, unvisitedStores);
    }
  }

  buildSummaryData(statistics, utilConfig, p1VisitFrequency, hasW5) {
    const data = [
      ["Total Stores to Visit:", statistics.totalStoresRequired || 0],
      ["Stores Planned:", statistics.totalStoresPlanned || 0],
      ["Coverage:", (statistics.coveragePercentage || 0) + "%"],
      ["Working Days Used:", statistics.workingDays || 0],
      ["Average Stores/Day:", statistics.averageStoresPerDay || 0],
      ["Total Distance:", (statistics.totalDistance || 0) + " km"],
      ["Selected Priorities:", utilConfig.includePriorities.join(", ")],
      ["P1 Visit Frequency:", Utils.formatFrequency(p1VisitFrequency)],
      ["Utilization:", utilConfig.utilization.toFixed(1) + "%"],
    ];

    // Add enhanced stats if available
    if (statistics.crossBorderOptimization) {
      data.push(
        ["", ""],
        ["ENHANCED OPTIMIZATION:", ""],
        ["Algorithm:", "Cross-Border Grid System"],
        ["Efficiency Gain:", statistics.crossBorderOptimization.efficiencyGain],
        [
          "Average Utilization:",
          statistics.crossBorderOptimization.avgUtilization,
        ],
        [
          "Cross-Border Days:",
          statistics.crossBorderOptimization.crossBorderDays,
        ]
      );
    }

    return data;
  }

  writeWeek(sheet, row, week, weekIdx) {
    const weekStats = this.calculateWeekStats(week);

    // Week header
    sheet
      .getRange(row, 1)
      .setValue(`WEEK ${weekIdx + 1}`)
      .setFontSize(14)
      .setFontWeight("bold");
    sheet
      .getRange(row, 7)
      .setValue(
        `${weekStats.stores} visits, ${weekStats.distance.toFixed(1)} km`
      );
    row += 2;

    // Days
    week.forEach((dayInfo) => {
      if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
        row = this.writeDayRoute(sheet, row, dayInfo.optimizedStores, dayInfo);
      } else {
        row = this.writeEmptyDay(sheet, row, dayInfo);
      }
    });

    return row + 1;
  }

  writeDayRoute(sheet, row, stores, dayInfo) {
    const dayStats = this.calculateDayStats(stores);

    // Day header
    const dayName =
      dayInfo.dayName + " - " + this.dateCalculator.formatDate(dayInfo.date);
    sheet.getRange(row, 1).setValue(dayName).setFontWeight("bold");
    sheet.getRange(row, 3).setValue(dayStats.storeCount + " stores");
    sheet.getRange(row, 4).setValue(dayStats.distance.toFixed(1) + " km");
    sheet.getRange(row, 5).setValue(Math.round(dayStats.duration) + " min");
    row++;

    // Store headers
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
    ];
    sheet
      .getRange(row, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold");
    row++;

    // Store details
    stores.forEach((store, index) => {
      const storeData = this.buildStoreRowData(store, index, stores);
      sheet.getRange(row, 1, 1, storeData.length).setValues([storeData]);

      // Highlight time violations
      if (store.isAfter6PM || store.timeWarning) {
        sheet
          .getRange(row, 1, 1, storeData.length)
          .setBackground("#ffcdd2")
          .setFontColor("#d32f2f");
      }
      row++;
    });

    return row + 1;
  }

  writeEmptyDay(sheet, row, dayInfo) {
    const dayName =
      dayInfo.dayName + " - " + this.dateCalculator.formatDate(dayInfo.date);
    sheet.getRange(row, 1).setValue(dayName).setFontWeight("bold");
    sheet
      .getRange(row, 3)
      .setValue("❌ NO STORES SCHEDULED")
      .setFontColor("#d32f2f");
    return row + 2;
  }

  writeUnvisitedStores(sheet, row, unvisitedStores) {
    row++;
    sheet
      .getRange(row, 1)
      .setValue("STORES NOT COVERED THIS MONTH")
      .setFontSize(14)
      .setFontWeight("bold");
    row++;

    sheet
      .getRange(row, 1)
      .setValue(`Total: ${unvisitedStores.length} stores not scheduled`)
      .setFontColor("#d32f2f");
    row += 2;

    const headers = [
      "Store Name",
      "No.Str",
      "Priority",
      "Frequency",
      "District",
    ];
    sheet
      .getRange(row, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold");
    row++;

    const displayCount = Math.min(20, unvisitedStores.length);
    for (let i = 0; i < displayCount; i++) {
      const store = unvisitedStores[i];
      const data = [
        store.name,
        store.noStr || "",
        store.priority,
        Utils.formatFrequency(store.baseFrequency || 0),
        store.district,
      ];
      sheet.getRange(row, 1, 1, data.length).setValues([data]);
      row++;
    }

    if (unvisitedStores.length > displayCount) {
      sheet
        .getRange(row, 1)
        .setValue(
          `... and ${unvisitedStores.length - displayCount} more stores`
        );
    }
  }

  // Helper methods
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

  formatSheet(sheet) {
    sheet.autoResizeColumns(1, 10);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(7, 200);
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
    return { stores, distance };
  }

  calculateDayStats(stores) {
    const storeCount = stores.length;
    const distance = stores.reduce(
      (sum, store) => sum + (store.distance || 0),
      0
    );
    const duration = stores.reduce(
      (sum, store) =>
        sum +
        (store.duration || 0) +
        CONFIG.BUFFER_TIME +
        (store.visitTime || CONFIG.DEFAULT_VISIT_TIME),
      0
    );
    return { storeCount, distance, duration };
  }

  buildStoreRowData(store, index, stores) {
    const { fromLat, fromLng, linkText } = this.getNavigationInfo(
      stores,
      index
    );
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
    ];
  }

  getNavigationInfo(stores, index) {
    if (index === 0) {
      return {
        fromLat: CONFIG.START.LAT,
        fromLng: CONFIG.START.LNG,
        linkText: "From Start",
      };
    }

    const prevStore = stores[index - 1];
    return {
      fromLat: prevStore.lat,
      fromLng: prevStore.lng,
      linkText: `From ${prevStore.name.substring(0, 15)}...`,
    };
  }
}

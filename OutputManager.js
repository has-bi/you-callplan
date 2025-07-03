// ==================== OUTPUT MANAGER ====================
class OutputManager {
  constructor(ss) {
    this.ss = ss;
    this.dateCalculator = new DateCalculator();
  }

  createSheet(planResult, utilConfig, allStores) {
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
    const sheetName = `MY Callplan - ${monthNames[currentDate.getMonth()]}`;

    let sheet;
    try {
      sheet = this.ss.insertSheet(sheetName);
      Utils.log("Created new sheet: " + sheetName, "INFO");
    } catch (e) {
      sheet = this.ss.getSheetByName(sheetName);
      sheet.clear();
      Utils.log("Cleared existing sheet: " + sheetName, "INFO");
    }

    this.writeContent(sheet, planResult, utilConfig);
    sheet.autoResizeColumns(1, 11);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(7, 200);
  }

  writeContent(
    sheet,
    { workingDays, unvisitedStores, statistics, p1VisitFrequency, hasW5 },
    utilConfig
  ) {
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

  writeHeader(sheet) {
    sheet
      .getRange(1, 1)
      .setValue("MONTHLY ROUTE PLAN")
      .setFontSize(16)
      .setFontWeight("bold");
    sheet.getRange(1, 7).setValue(new Date().toLocaleString("en-MY"));
    return 3;
  }

  writeSummary(sheet, row, statistics, utilConfig, p1VisitFrequency, hasW5) {
    sheet
      .getRange(row, 1)
      .setValue("EXECUTIVE SUMMARY")
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground("#e3f2fd");
    row++;

    const summaryData = [
      ["Total Stores to Visit:", statistics.totalStoresRequired],
      ["Stores Planned:", statistics.totalStoresPlanned],
      ["Coverage:", statistics.coveragePercentage + "%"],
      ["Working Weeks Used:", hasW5 ? "5 (Including W5)" : "4"],
      ["Working Days Used:", statistics.workingDays],
      ["Average Stores/Day:", statistics.averageStoresPerDay],
      ["Total Distance:", statistics.totalDistance.toFixed(1) + " km"],
      ["Selected Priorities:", utilConfig.includePriorities.join(", ")],
      ["P1 Visit Frequency:", Utils.formatFrequency(p1VisitFrequency)],
      ["Utilization:", utilConfig.utilization.toFixed(1) + "%"],
    ];

    // Add time optimization results if available
    if (statistics.timeOptimization) {
      summaryData.push(["", ""]); // Empty row for spacing
      summaryData.push(["TIME OPTIMIZATION:", ""]);
      summaryData.push([
        "Base Route Stores:",
        statistics.timeOptimization.baseStores,
      ]);
      summaryData.push([
        "Added by Time Optimizer:",
        statistics.timeOptimization.addedStores,
      ]);
      summaryData.push([
        "Total Improvement:",
        "+" +
          (
            (statistics.timeOptimization.addedStores /
              statistics.timeOptimization.baseStores) *
            100
          ).toFixed(1) +
          "%",
      ]);
      summaryData.push([
        "Avg End Time:",
        statistics.timeOptimization.avgEndTime,
      ]);
      summaryData.push([
        "Time Utilization:",
        statistics.timeOptimization.timeUtilization + "%",
      ]);
    }

    // Add retailer breakdown if we have retailer statistics
    if (statistics.retailerCounts) {
      summaryData.push(["", ""]); // Empty row for spacing
      summaryData.push(["RETAILER BREAKDOWN:", ""]);
      Object.entries(statistics.retailerCounts).forEach(([retailer, count]) => {
        summaryData.push([`${retailer}:`, count + " stores"]);
      });
    }

    sheet.getRange(row, 1, summaryData.length, 2).setValues(summaryData);
    return row + summaryData.length + 2;
  }

  writeWeeklyRoutes(sheet, row, workingDays) {
    workingDays.forEach((week, weekIdx) => {
      row = this.writeWeekHeader(sheet, row, week, weekIdx);

      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0) {
          row = this.writeDayRoute(
            sheet,
            row,
            dayInfo.optimizedStores,
            dayInfo
          );
        } else {
          row = this.writeEmptyDay(sheet, row, dayInfo);
        }
      });

      row++;
    });

    return row;
  }

  writeWeekHeader(sheet, row, week, weekIdx) {
    const weekStores = week.reduce(
      (sum, dayInfo) =>
        sum + (dayInfo.optimizedStores ? dayInfo.optimizedStores.length : 0),
      0
    );
    const weekDistance = week.reduce((sum, dayInfo) => {
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
    const p1Count = week.reduce((sum, dayInfo) => {
      if (dayInfo.optimizedStores) {
        return (
          sum +
          dayInfo.optimizedStores.filter((store) => store.priority === "P1")
            .length
        );
      }
      return sum;
    }, 0);

    // Calculate retailer counts for this week
    const weekRetailerCounts = this.getRetailerCounts(week);
    const retailerSummary = Object.entries(weekRetailerCounts)
      .map(([retailer, count]) => `${retailer}: ${count}`)
      .join(", ");

    sheet
      .getRange(row, 1)
      .setValue(`WEEK ${weekIdx + 1}`)
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground("#e8f5e9");
    sheet
      .getRange(row, 7)
      .setValue(
        `${weekStores} visits, ${weekDistance.toFixed(1)} km (P1: ${p1Count})`
      );

    // Add retailer breakdown on next row if there are stores
    if (weekStores > 0 && retailerSummary) {
      row++;
      sheet
        .getRange(row, 7)
        .setValue(`Retailers: ${retailerSummary}`)
        .setFontStyle("italic")
        .setFontSize(9);
    }

    return row + 2;
  }

  // NEW: Calculate retailer counts for a week
  getRetailerCounts(week) {
    const counts = {};
    week.forEach((dayInfo) => {
      if (dayInfo.optimizedStores) {
        dayInfo.optimizedStores.forEach((store) => {
          const retailer = this.normalizeRetailerName(store.retailer);
          counts[retailer] = (counts[retailer] || 0) + 1;
        });
      }
    });

    // Sort by count (descending) and return only non-zero counts
    return Object.fromEntries(
      Object.entries(counts)
        .filter(([retailer, count]) => count > 0)
        .sort(([, a], [, b]) => b - a)
    );
  }

  writeDayRoute(sheet, row, day, dayInfo) {
    const dayDistance = day.reduce(
      (sum, store) => sum + (store.distance || 0),
      0
    );
    const dayDuration = day.reduce(
      (sum, store) =>
        sum + (store.duration || 0) + CONFIG.BUFFER_TIME + store.visitTime,
      0
    );
    const districts = [...new Set(day.map((s) => s.district))];

    // Calculate retailer counts for this day
    const dayRetailerCounts = {};
    day.forEach((store) => {
      const retailer = this.normalizeRetailerName(store.retailer);
      dayRetailerCounts[retailer] = (dayRetailerCounts[retailer] || 0) + 1;
    });

    const retailerSummary = Object.entries(dayRetailerCounts)
      .filter(([retailer, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([retailer, count]) => `${retailer}: ${count}`)
      .join(", ");

    sheet
      .getRange(row, 1)
      .setValue(
        dayInfo.dayName + " - " + this.dateCalculator.formatDate(dayInfo.date)
      )
      .setFontWeight("bold")
      .setBackground("#f5f5f5");
    sheet.getRange(row, 3).setValue(day.length + " stores");
    sheet.getRange(row, 4).setValue(dayDistance.toFixed(1) + " km");
    sheet.getRange(row, 5).setValue(Math.round(dayDuration) + " min");
    sheet
      .getRange(row, 6)
      .setValue("Districts: " + districts.join(", "))
      .setFontStyle("italic");

    // Add retailer breakdown
    if (retailerSummary) {
      sheet
        .getRange(row, 8)
        .setValue("Retailers: " + retailerSummary)
        .setFontStyle("italic")
        .setFontSize(9);
    }

    row++;

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
    ];
    sheet
      .getRange(row, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold")
      .setFontSize(10);
    row++;

    day.forEach((store, index) => {
      const { fromLat, fromLng, linkText } = this.getNavigationInfo(day, index);
      const mapsUrl = Utils.mapsLink(fromLat, fromLng, store.lat, store.lng);

      const storeData = [
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
      ];

      sheet.getRange(row, 1, 1, storeData.length).setValues([storeData]);

      if (store.isFractionalVisit) {
        sheet.getRange(row, 1, 1, storeData.length).setBackground("#fff3e0");
      }

      row++;
    });

    return row + 1;
  }

  // NEW: Normalize retailer names for consistent counting
  normalizeRetailerName(retailer) {
    if (!retailer) return "Unknown";

    const normalized = retailer.toString().toLowerCase().trim();

    // Map variations to standard names
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

    // Return original with proper capitalization
    return retailer.toString().trim();
  }

  writeEmptyDay(sheet, row, dayInfo) {
    sheet
      .getRange(row, 1)
      .setValue(
        dayInfo.dayName + " - " + this.dateCalculator.formatDate(dayInfo.date)
      )
      .setFontWeight("bold")
      .setBackground("#f5f5f5");
    sheet
      .getRange(row, 3)
      .setValue("No stores scheduled")
      .setFontStyle("italic")
      .setFontColor("#999999");
    return row + 2;
  }

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

  writeUnvisitedStores(sheet, row, unvisitedStores) {
    if (!unvisitedStores || !unvisitedStores.length) return;

    row++;
    sheet
      .getRange(row, 1)
      .setValue("STORES NOT COVERED THIS MONTH")
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground("#ffcdd2");
    row++;

    const fractionalUnvisited = unvisitedStores.filter(
      (s) => s.baseFrequency && s.baseFrequency < 1
    );
    const regularUnvisited = unvisitedStores.filter(
      (s) => !s.baseFrequency || s.baseFrequency >= 1
    );

    sheet
      .getRange(row, 1)
      .setValue(
        `Total: ${unvisitedStores.length} stores not scheduled (${fractionalUnvisited.length} fractional, ${regularUnvisited.length} regular)`
      )
      .setFontColor("#d32f2f");
    row += 2;

    if (fractionalUnvisited.length > 0) {
      sheet
        .getRange(row, 1)
        .setValue(
          "FRACTIONAL FREQUENCY STORES (Expected - will appear in future months)"
        )
        .setFontWeight("bold")
        .setBackground("#fff3e0");
      row++;

      const fractionalByPriority = {};
      fractionalUnvisited.forEach((store) => {
        if (!fractionalByPriority[store.priority]) {
          fractionalByPriority[store.priority] = [];
        }
        fractionalByPriority[store.priority].push(store);
      });

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

    if (regularUnvisited.length > 0) {
      sheet
        .getRange(row, 1)
        .setValue("REGULAR STORES (Could not fit in schedule)")
        .setFontWeight("bold")
        .setBackground("#ffcdd2");
      row++;

      const regularByPriority = {};
      regularUnvisited.forEach((store) => {
        if (!regularByPriority[store.priority]) {
          regularByPriority[store.priority] = [];
        }
        regularByPriority[store.priority].push(store);
      });

      Object.entries(regularByPriority).forEach(([priority, stores]) => {
        sheet.getRange(row, 1).setValue(`${priority}: ${stores.length} stores`);
        row++;
      });
      row++;
    }

    if (regularUnvisited.length > 0) {
      const headers = [
        "Store Name",
        "No.Str",
        "Retailer",
        "District",
        "Priority",
        "Frequency",
        "Address",
      ];
      sheet
        .getRange(row, 1, 1, headers.length)
        .setValues([headers])
        .setFontWeight("bold");
      row++;

      const displayCount = Math.min(30, regularUnvisited.length);
      for (let i = 0; i < displayCount; i++) {
        const store = regularUnvisited[i];
        const frequency = store.baseFrequency
          ? store.baseFrequency < 1
            ? store.baseFrequency.toFixed(2)
            : store.baseFrequency.toString()
          : (store.visits || 0).toString();

        const data = [
          store.name,
          store.noStr || "",
          store.retailer || "",
          store.district,
          store.priority,
          frequency + "/mo",
          (store.address || "").substring(0, 40) +
            (store.address && store.address.length > 40 ? "..." : ""),
        ];

        sheet.getRange(row, 1, 1, data.length).setValues([data]);
        sheet.getRange(row, 1, 1, data.length).setBackground("#ffebee");
        row++;
      }

      if (regularUnvisited.length > displayCount) {
        row++;
        sheet
          .getRange(row, 1)
          .setValue(
            "... and " +
              (regularUnvisited.length - displayCount) +
              " more regular stores"
          )
          .setFontStyle("italic");
      }
    }
  }
}

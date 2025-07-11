// ==================== ENHANCED OUTPUT MANAGER - DAY-BY-DAY RESULTS ====================
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
    sheet.autoResizeColumns(1, 13); // Extended for day-by-day info
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(7, 200);
    sheet.setColumnWidth(12, 180); // Mall info column
    sheet.setColumnWidth(13, 120); // Multi-visit info column
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
      .setValue("MONTHLY ROUTE PLAN - DAY-BY-DAY OPTIMIZATION WITH 14-DAY GAPS")
      .setFontSize(16)
      .setFontWeight("bold");
    sheet.getRange(1, 9).setValue(new Date().toLocaleString("en-MY"));
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
      [
        "Working Days Used:",
        statistics.workingDays +
          "/" +
          (statistics.twoPhaseOptimization
            ? statistics.twoPhaseOptimization.totalDays
            : "22"),
      ],
      ["Average Stores/Day:", statistics.averageStoresPerDay],
      ["Total Distance:", statistics.totalDistance.toFixed(1) + " km"],
      ["Selected Priorities:", utilConfig.includePriorities.join(", ")],
      ["P1 Visit Frequency:", Utils.formatFrequency(p1VisitFrequency)],
      ["Utilization:", utilConfig.utilization.toFixed(1) + "%"],
    ];

    // NEW: Two-phase optimization results
    if (statistics.twoPhaseOptimization) {
      summaryData.push(["", ""]); // Empty row
      summaryData.push(["TWO-PHASE OPTIMIZATION:", ""]);
      summaryData.push([
        "Max Stores/Day:",
        statistics.twoPhaseOptimization.maxStoresPerDay,
      ]);
      summaryData.push([
        "Min Stores/Day:",
        statistics.twoPhaseOptimization.minStoresPerDay,
      ]);
      summaryData.push([
        "Empty Days:",
        statistics.twoPhaseOptimization.emptyDays,
      ]);
      summaryData.push([
        "Day Utilization:",
        statistics.twoPhaseOptimization.utilizationRate + "%",
      ]);
      summaryData.push([
        "Balance Score:",
        statistics.twoPhaseOptimization.balanceScore +
          "% (higher = more balanced)",
      ]);
      summaryData.push([
        "Phase 1:",
        statistics.twoPhaseOptimization.phase1_AggressiveAssignment,
      ]);
      summaryData.push([
        "Phase 2:",
        statistics.twoPhaseOptimization.phase2_MultiVisitRebalancing,
      ]);
      summaryData.push([
        "Phase 3:",
        statistics.twoPhaseOptimization.phase3_FineTuning,
      ]);
    }

    // Multi-visit gap compliance
    if (statistics.multiVisitGaps) {
      summaryData.push(["", ""]); // Empty row
      summaryData.push(["MULTI-VISIT GAP COMPLIANCE:", ""]);
      summaryData.push([
        "Multi-visit Stores:",
        statistics.multiVisitGaps.totalMultiVisitStores,
      ]);
      summaryData.push([
        "14-Day Gap Compliance:",
        statistics.multiVisitGaps.gapCompliance + "%",
      ]);
      summaryData.push([
        "Valid Gaps:",
        statistics.multiVisitGaps.validGaps +
          "/" +
          statistics.multiVisitGaps.totalGaps,
      ]);
    }

    // Mall clustering statistics
    if (statistics.mallStats) {
      summaryData.push(["", ""]); // Empty row
      summaryData.push(["MALL CLUSTERING RESULTS:", ""]);
      summaryData.push([
        "Mall Clusters Detected:",
        statistics.mallStats.totalMallClusters,
      ]);
      summaryData.push([
        "Stores in Mall Clusters:",
        statistics.mallStats.storesInMalls,
      ]);
      summaryData.push([
        "Average Stores per Mall:",
        statistics.mallStats.avgStoresPerMall,
      ]);
      summaryData.push([
        "Mall Clustering Efficiency:",
        statistics.mallStats.clusteringEfficiency + "%",
      ]);
      summaryData.push([
        "Travel Time Savings:",
        statistics.mallStats.timeSavings + " minutes",
      ]);
    }

    // Retailer breakdown
    if (statistics.retailerCounts) {
      summaryData.push(["", ""]); // Empty row
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

    // Multi-visit stores in this week
    const multiVisitStores = week.reduce((sum, dayInfo) => {
      if (dayInfo.optimizedStores) {
        return (
          sum +
          dayInfo.optimizedStores.filter((store) => store.isMultiVisit).length
        );
      }
      return sum;
    }, 0);

    // Mall statistics for the week
    const weekMallStats = this.calculateWeekMallStats(week);
    const mallSummary =
      weekMallStats.mallClusters > 0
        ? ` | ${weekMallStats.mallClusters} malls (${weekMallStats.storesInMalls} stores)`
        : "";

    // Day utilization for the week
    const activeDays = week.filter(
      (dayInfo) => dayInfo.optimizedStores && dayInfo.optimizedStores.length > 0
    ).length;
    const utilizationSummary = ` | ${activeDays}/5 days used`;

    sheet
      .getRange(row, 1)
      .setValue(`WEEK ${weekIdx + 1}`)
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground("#e8f5e9");

    sheet
      .getRange(row, 7)
      .setValue(
        `${weekStores} visits, ${weekDistance.toFixed(
          1
        )} km${mallSummary}${utilizationSummary}`
      )
      .setFontSize(11);

    // Multi-visit info
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

    // Multi-visit stores in this day
    const multiVisitStores = day.filter((store) => store.isMultiVisit);
    const dayMallInfo = this.calculateDayMallInfo(day);

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

    // Day header with enhanced info
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

    // Mall information
    if (dayMallInfo.summary) {
      sheet
        .getRange(row, 12)
        .setValue(dayMallInfo.summary)
        .setFontStyle("italic")
        .setFontSize(9)
        .setBackground("#e8f5e9");
    }

    // Multi-visit information
    if (multiVisitStores.length > 0) {
      sheet
        .getRange(row, 13)
        .setValue(`${multiVisitStores.length} multi-visit`)
        .setFontStyle("italic")
        .setFontSize(9)
        .setBackground("#ffe0b2");
    }

    row++;

    // ENHANCED: Headers with multi-visit information
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
      "Mall Info",
      "Visit Info",
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

      // Mall information
      const mallInfo = this.formatStoreMallInfo(
        store,
        index > 0 ? day[index - 1] : null
      );

      // Multi-visit information
      const visitInfo = this.formatVisitInfo(store);

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
        mallInfo,
        visitInfo,
      ];

      sheet.getRange(row, 1, 1, storeData.length).setValues([storeData]);

      // Enhanced color coding
      if (store.isFractionalVisit) {
        sheet.getRange(row, 1, 1, storeData.length).setBackground("#fff3e0"); // Fractional visits - orange
      } else if (store.isMultiVisit) {
        sheet.getRange(row, 1, 1, storeData.length).setBackground("#ffe0b2"); // Multi-visit - amber
      } else if (store.mallClusterId) {
        sheet.getRange(row, 1, 1, storeData.length).setBackground("#e8f5e9"); // Mall visits - light green
      }

      row++;
    });

    return row + 1;
  }

  // NEW: Format visit information
  formatVisitInfo(store) {
    if (store.isMultiVisit) {
      return `Visit ${store.visitNum}/${store.actualVisits || 1}`;
    } else if (store.isFractionalVisit) {
      return `Fractional (${(store.baseFrequency || 0).toFixed(2)})`;
    } else {
      return "Regular";
    }
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

    const summary = `${mallCount} malls: ${mallSummaries.join(" | ")}`;

    return {
      summary: summary,
      mallCount: mallCount,
      mallStores: mallStores,
      details: mallClusters,
    };
  }

  formatStoreMallInfo(store, previousStore) {
    if (!store.mallClusterId) {
      return "Individual";
    }

    const mallInfo = store.mallClusterInfo || {};
    let info = `Mall (${mallInfo.storeCount || "?"} stores)`;

    if (previousStore && previousStore.mallClusterId === store.mallClusterId) {
      info += " - Walk";
    } else if (store.mallClusterId) {
      info += " - Drive";
    }

    return info;
  }

  writeEmptyDay(sheet, row, dayInfo) {
    sheet
      .getRange(row, 1)
      .setValue(
        dayInfo.dayName + " - " + this.dateCalculator.formatDate(dayInfo.date)
      )
      .setFontWeight("bold")
      .setBackground("#ffcdd2"); // Red background for empty days
    sheet
      .getRange(row, 3)
      .setValue("❌ NO STORES SCHEDULED")
      .setFontStyle("italic")
      .setFontWeight("bold")
      .setFontColor("#d32f2f");
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
    const multiVisitUnvisited = unvisitedStores.filter((s) => s.isMultiVisit);

    sheet
      .getRange(row, 1)
      .setValue(
        `Total: ${unvisitedStores.length} stores not scheduled ` +
          `(${fractionalUnvisited.length} fractional, ${regularUnvisited.length} regular, ${multiVisitUnvisited.length} multi-visit)`
      )
      .setFontColor("#d32f2f");
    row += 2;

    // Show why stores weren't scheduled
    if (unvisitedStores.length > 0) {
      sheet
        .getRange(row, 1)
        .setValue("POSSIBLE REASONS FOR UNVISITED STORES:")
        .setFontWeight("bold");
      row++;

      const reasons = [
        "• Day capacity limits (15 stores/day max)",
        "• Time constraints (must finish by 6:20 PM)",
        "• Geographic clustering efficiency",
        "• 14-day gap requirements for multi-visit stores",
        "• Fractional frequency probability distribution",
      ];

      reasons.forEach((reason) => {
        sheet.getRange(row, 1).setValue(reason);
        row++;
      });
      row++;
    }

    // Rest of unvisited stores reporting...
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
        .setValue("REGULAR STORES (Could not fit in optimized schedule)")
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

    // Show sample of unvisited stores
    if (regularUnvisited.length > 0) {
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
        const frequency = store.baseFrequency
          ? store.baseFrequency < 1
            ? store.baseFrequency.toFixed(2)
            : store.baseFrequency.toString()
          : (store.visits || 0).toString();

        const visitType = store.isMultiVisit
          ? "Multi-visit"
          : store.isFractionalVisit
          ? "Fractional"
          : "Regular";

        const data = [
          store.name,
          store.noStr || "",
          store.retailer || "",
          store.district,
          store.priority,
          frequency + "/mo",
          (store.address || "").substring(0, 40) +
            (store.address && store.address.length > 40 ? "..." : ""),
          visitType,
        ];

        sheet.getRange(row, 1, 1, data.length).setValues([data]);

        if (store.isMultiVisit) {
          sheet.getRange(row, 1, 1, data.length).setBackground("#ffe0b2"); // Multi-visit - amber
        } else {
          sheet.getRange(row, 1, 1, data.length).setBackground("#ffebee"); // Regular - light red
        }

        row++;
      }

      if (regularUnvisited.length > displayCount) {
        row++;
        sheet
          .getRange(row, 1)
          .setValue(
            "... and " +
              (regularUnvisited.length - displayCount) +
              " more stores"
          )
          .setFontStyle("italic");
      }
    }
  }

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

    return Object.fromEntries(
      Object.entries(counts)
        .filter(([retailer, count]) => count > 0)
        .sort(([, a], [, b]) => b - a)
    );
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

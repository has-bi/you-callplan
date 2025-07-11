// ==================== SIMPLE OUTPUT MANAGER ====================
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
      .setValue("MONTHLY ROUTE PLAN - SIMPLE GEOGRAPHIC OPTIMIZATION")
      .setFontSize(16)
      .setFontWeight("bold");
    sheet.getRange(1, 8).setValue(new Date().toLocaleString("en-MY"));
    return 3;
  }

  writeSummary(sheet, row, statistics, utilConfig, p1VisitFrequency, hasW5) {
    sheet
      .getRange(row, 1)
      .setValue("SUMMARY")
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground("#e3f2fd");
    row++;

    const summaryData = [
      ["Total Stores to Visit:", statistics.totalStoresRequired],
      ["Stores Planned:", statistics.totalStoresPlanned],
      ["Coverage:", statistics.coveragePercentage + "%"],
      ["Working Days Used:", statistics.workingDays],
      ["Average Stores/Day:", statistics.averageStoresPerDay],
      ["Total Distance:", statistics.totalDistance.toFixed(1) + " km"],
      ["Selected Priorities:", utilConfig.includePriorities.join(", ")],
      ["Utilization:", utilConfig.utilization.toFixed(1) + "%"],
    ];

    // Simple optimization info
    if (statistics.simpleOptimization) {
      summaryData.push(["", ""]);
      summaryData.push(["Algorithm:", statistics.simpleOptimization.algorithm]);
      summaryData.push([
        "Total Working Days:",
        statistics.simpleOptimization.totalDays,
      ]);
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

    sheet
      .getRange(row, 1)
      .setValue(`WEEK ${weekIdx + 1}`)
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground("#e8f5e9");

    sheet
      .getRange(row, 7)
      .setValue(`${weekStores} visits, ${weekDistance.toFixed(1)} km`)
      .setFontSize(11);

    return row + 2;
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
      } else if (store.isMultiVisit) {
        sheet.getRange(row, 1, 1, storeData.length).setBackground("#ffe0b2");
      }

      row++;
    });

    return row + 1;
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
      .setValue("UNVISITED STORES")
      .setFontSize(14)
      .setFontWeight("bold")
      .setBackground("#ffcdd2");
    row++;

    sheet
      .getRange(row, 1)
      .setValue(`Total: ${unvisitedStores.length} stores not scheduled`)
      .setFontColor("#d32f2f");
    row += 2;

    if (unvisitedStores.length > 0) {
      const headers = ["Store Name", "Priority", "District", "Retailer"];
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
          store.priority,
          store.district,
          store.retailer || "",
        ];

        sheet.getRange(row, 1, 1, data.length).setValues([data]);
        sheet.getRange(row, 1, 1, data.length).setBackground("#ffebee");
        row++;
      }

      if (unvisitedStores.length > displayCount) {
        row++;
        sheet
          .getRange(row, 1)
          .setValue(
            "... and " +
              (unvisitedStores.length - displayCount) +
              " more stores"
          )
          .setFontStyle("italic");
      }
    }
  }
}

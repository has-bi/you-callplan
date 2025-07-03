// ==================== DATE CALCULATOR ====================
class DateCalculator {
  constructor() {
    const today = new Date();
    this.currentMonth = today.getMonth();
    this.currentYear = today.getFullYear();
  }

  getMonthlyWorkingDays() {
    const workingDays = [];
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);

    let weekNumber = 0;
    let currentWeek = [];

    for (
      let date = new Date(firstDay);
      date <= lastDay;
      date.setDate(date.getDate() + 1)
    ) {
      const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday

      // Only include Monday to Friday (1-5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const dayInfo = {
          date: new Date(date),
          dayOfWeek: dayOfWeek,
          dayName: this.getDayName(dayOfWeek),
          isFriday: dayOfWeek === 5,
          week: weekNumber,
          dayIndex: dayOfWeek - 1, // 0=Monday, 1=Tuesday, ..., 4=Friday
          stores: [],
          breakType: dayOfWeek === 5 ? "prayer" : "lunch",
        };

        currentWeek.push(dayInfo);

        // Start new week after Friday or if we have 5 days
        if (dayOfWeek === 5 || currentWeek.length === 5) {
          workingDays.push([...currentWeek]);
          currentWeek = [];
          weekNumber++;
        }
      }
    }

    // Add any remaining days as final week (W5 if available)
    if (currentWeek.length > 0) {
      workingDays.push(currentWeek);
    }

    // Log week structure for debugging
    Utils.log(
      "Month structure: " +
        workingDays.length +
        " weeks (" +
        (workingDays.length === 5 ? "W5 AVAILABLE" : "Standard 4 weeks") +
        ")",
      "INFO"
    );
    workingDays.forEach(function (week, idx) {
      Utils.log(
        "Week " +
          (idx + 1) +
          ": " +
          week.length +
          " days (" +
          week
            .map(function (d) {
              return d.dayName;
            })
            .join(", ") +
          ")",
        "INFO"
      );
    });

    return workingDays;
  }

  getDayName(dayOfWeek) {
    const names = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return names[dayOfWeek];
  }

  formatDate(date) {
    return date.toLocaleDateString("en-MY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  // NEW: Calculate total working days in current month
  getTotalWorkingDays() {
    const workingDays = this.getMonthlyWorkingDays();
    return workingDays.reduce((total, week) => total + week.length, 0);
  }

  // NEW: Get current month info for fractional calculations
  getMonthInfo() {
    const workingDays = this.getMonthlyWorkingDays();
    const totalWorkingDays = this.getTotalWorkingDays();

    return {
      month: this.currentMonth,
      year: this.currentYear,
      totalWorkingDays,
      weekCount: workingDays.length,
      hasW5: workingDays.length === 5,
      workingDays,
    };
  }
}

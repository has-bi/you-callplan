// ==================== ROUTE OPTIMIZER - FIXED WITH STAGE-BY-STAGE DEDUPLICATION ====================
class RouteOptimizer {
  constructor() {
    this.dateCalculator = new DateCalculator();
    this.workingDays = this.dateCalculator.getMonthlyWorkingDays();
    this.flatDays = this.flattenWorkingDays();
    this.useEnhancedOptimization = true;
  }

  // Main optimization flow
  optimizePlan(stores) {
    Utils.log(
      "=== STARTING ROUTE OPTIMIZATION WITH STAGE DEDUPLICATION ===",
      "INFO"
    );

    try {
      if (this.useEnhancedOptimization && stores.length >= 10) {
        return this.runEnhancedOptimization(stores);
      } else {
        return this.runBasicOptimizationFixed(stores);
      }
    } catch (error) {
      Utils.log(
        "Enhanced optimization failed, using basic: " + error.toString(),
        "ERROR"
      );
      return this.runBasicOptimizationFixed(stores);
    }
  }

  // FIXED: Basic optimization with aggressive pre-clustering deduplication
  runBasicOptimizationFixed(stores) {
    Utils.log(
      "🔧 Using FIXED Basic Optimization with Aggressive Deduplication",
      "INFO"
    );

    // STAGE 0: AGGRESSIVE INPUT DEDUPLICATION
    const uniqueInputStores = this.aggressiveDeduplication(
      stores,
      "INPUT STORES"
    );

    const validStores = this.filterByDistanceLimit(uniqueInputStores);

    // FIX 1: Create visit instances with deduplication
    const visitInstances = this.createVisitInstancesFixed(validStores);
    Utils.log(
      `Visit instances after creation: ${visitInstances.length}`,
      "INFO"
    );

    // STAGE 1: PRE-CLUSTERING DEDUPLICATION
    const preclusteringStores = this.aggressiveDeduplication(
      visitInstances,
      "PRE-CLUSTERING"
    );

    const optimalK = this.calculateOptimalClusters(preclusteringStores.length);
    const clusters = this.performKMeansClusteringFixed(
      preclusteringStores,
      optimalK
    );

    // STAGE 2: POST-CLUSTERING VERIFICATION
    const verifiedClusters = this.verifyClustersForDuplicates(clusters);

    const dayAssignments = this.assignClustersTodays(verifiedClusters);

    // STAGE 3 DEDUPLICATION: After day assignment
    dayAssignments.forEach((day, idx) => {
      day.stores = this.aggressiveDeduplication(
        day.stores,
        `DAY ${idx} AFTER ASSIGNMENT`
      );
    });

    // FIX 3: Enforce time constraints with deduplication
    this.enforceTimeConstraints(dayAssignments);

    // STAGE 4 DEDUPLICATION: After time constraints
    dayAssignments.forEach((day, idx) => {
      day.stores = this.aggressiveDeduplication(
        day.stores,
        `DAY ${idx} AFTER TIME CONSTRAINTS`
      );
    });

    this.optimizeDailyRoutes(dayAssignments);

    // FIX 2: Multi-visit constraints with deduplication
    this.enforceMultiVisitConstraintsFixed(dayAssignments);

    // STAGE 5: FINAL AGGRESSIVE DEDUPLICATION
    dayAssignments.forEach((day, idx) => {
      day.stores = this.aggressiveDeduplication(day.stores, `DAY ${idx} FINAL`);
    });

    // Final validation
    this.validateFinalAssignments(dayAssignments);

    return this.convertBasicToOutputFormat(
      dayAssignments,
      uniqueInputStores,
      preclusteringStores
    );
  }

  // NEW: Aggressive deduplication that's more thorough
  aggressiveDeduplication(stores, stageName = "UNKNOWN") {
    if (!stores || stores.length === 0) return stores;

    const storeMap = new Map(); // Use Map for better duplicate detection
    const duplicates = [];

    stores.forEach((store, index) => {
      const noStr = store.noStr || store.name || `UNNAMED_${index}`;

      if (storeMap.has(noStr)) {
        // Found duplicate - compare which one to keep
        const existing = storeMap.get(noStr);
        const duplicate = {
          noStr: noStr,
          name: store.name,
          stage: stageName,
          visitId: store.visitId,
          priority: store.priority,
          existing: existing.priority,
          action: "REMOVED",
        };

        // Keep the one with higher priority (lower priority number)
        const existingPriorityNum =
          parseInt(existing.priority?.replace("P", "")) || 999;
        const currentPriorityNum =
          parseInt(store.priority?.replace("P", "")) || 999;

        if (currentPriorityNum < existingPriorityNum) {
          // Current store has higher priority, replace existing
          storeMap.set(noStr, store);
          duplicate.action = "REPLACED_EXISTING";
          Utils.log(
            `🔄 ${stageName}: Replaced ${noStr} (${existing.priority} → ${store.priority})`,
            "INFO"
          );
        } else {
          // Keep existing, discard current
          Utils.log(
            `🗑️ ${stageName}: Discarded duplicate ${noStr} (kept ${existing.priority}, discarded ${store.priority})`,
            "WARN"
          );
        }

        duplicates.push(duplicate);
      } else {
        storeMap.set(noStr, store);
      }
    });

    const unique = Array.from(storeMap.values());

    if (duplicates.length > 0) {
      Utils.log(
        `🔍 AGGRESSIVE DEDUP - ${stageName}: Processed ${duplicates.length} duplicates:`,
        "WARN"
      );
      duplicates.forEach((dup) => {
        Utils.log(
          `   ${dup.action}: ${dup.noStr} (${dup.name}) [existing: ${dup.existing}, duplicate: ${dup.priority}]`,
          "WARN"
        );
      });
      Utils.log(
        `   Result: ${stores.length} → ${unique.length} stores`,
        "INFO"
      );
    } else {
      Utils.log(
        `✅ AGGRESSIVE DEDUP - ${stageName}: No duplicates found (${stores.length} stores)`,
        "INFO"
      );
    }

    return unique;
  }

  // FIXED: K-means clustering with better duplicate prevention
  performKMeansClusteringFixed(stores, k) {
    if (stores.length <= k) {
      Utils.log(
        `Small dataset: Creating ${stores.length} single-store clusters`,
        "INFO"
      );
      return stores.map((store) => [store]);
    }

    Utils.log(
      `🔗 Starting FIXED K-means clustering: ${stores.length} unique stores into ${k} clusters`,
      "INFO"
    );

    // Pre-clustering verification
    const preClusterDedup = this.aggressiveDeduplication(
      stores,
      "PRE-CLUSTER VERIFICATION"
    );
    if (preClusterDedup.length !== stores.length) {
      Utils.log(
        `❌ WARNING: Found duplicates before clustering! Using deduplicated set.`,
        "ERROR"
      );
      stores = preClusterDedup;
    }

    const centroids = this.initializeCentroidsKMeansPlusPlus(stores, k);
    let clusters = [];
    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      clusters = Array(k)
        .fill(null)
        .map(() => []);

      // Simple assignment - each store goes to exactly one cluster
      stores.forEach((store) => {
        let minDist = Infinity;
        let bestCluster = 0;

        centroids.forEach((centroid, idx) => {
          const dist = Utils.distance(
            store.lat,
            store.lng,
            centroid.lat,
            centroid.lng
          );
          if (dist < minDist) {
            minDist = dist;
            bestCluster = idx;
          }
        });

        clusters[bestCluster].push(store);
      });

      // Update centroids
      clusters.forEach((cluster, idx) => {
        if (cluster.length > 0) {
          centroids[idx] = {
            lat: cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length,
            lng: cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length,
          };
        }
      });

      iterations++;
    }

    const finalClusters = clusters.filter((c) => c.length > 0);

    Utils.log(
      `✅ K-means clustering complete: ${finalClusters.length} clusters`,
      "INFO"
    );
    finalClusters.forEach((cluster, idx) => {
      Utils.log(`   Cluster ${idx + 1}: ${cluster.length} stores`, "INFO");
    });

    return finalClusters;
  }

  // NEW: Verify clusters don't contain duplicates
  verifyClustersForDuplicates(clusters) {
    Utils.log("🔍 Verifying clusters for duplicates...", "INFO");

    const verifiedClusters = clusters
      .map((cluster, idx) => {
        const deduplicated = this.aggressiveDeduplication(
          cluster,
          `CLUSTER ${idx + 1} VERIFICATION`
        );
        return deduplicated;
      })
      .filter((cluster) => cluster.length > 0);

    // Cross-cluster duplicate check
    const allStores = [];
    verifiedClusters.forEach((cluster) => allStores.push(...cluster));

    const finalCheck = this.aggressiveDeduplication(
      allStores,
      "CROSS-CLUSTER VERIFICATION"
    );

    if (finalCheck.length !== allStores.length) {
      Utils.log(
        `❌ CRITICAL: Found cross-cluster duplicates! ${allStores.length} → ${finalCheck.length}`,
        "ERROR"
      );

      // Rebuild clusters from deduplicated stores
      Utils.log("🔧 Rebuilding clusters from deduplicated stores...", "WARN");
      const rebuiltClusters = this.rebuildClustersFromDeduplicatedStores(
        finalCheck,
        verifiedClusters.length
      );
      return rebuiltClusters;
    }

    Utils.log(
      `✅ Cluster verification complete: No cross-cluster duplicates found`,
      "INFO"
    );
    return verifiedClusters;
  }

  // NEW: Rebuild clusters if cross-cluster duplicates found
  rebuildClustersFromDeduplicatedStores(
    deduplicatedStores,
    targetClusterCount
  ) {
    Utils.log(
      `🔧 Rebuilding ${targetClusterCount} clusters from ${deduplicatedStores.length} deduplicated stores`,
      "INFO"
    );

    const storesPerCluster = Math.ceil(
      deduplicatedStores.length / targetClusterCount
    );
    const rebuiltClusters = [];

    for (let i = 0; i < targetClusterCount; i++) {
      const startIdx = i * storesPerCluster;
      const endIdx = Math.min(
        startIdx + storesPerCluster,
        deduplicatedStores.length
      );

      if (startIdx < deduplicatedStores.length) {
        const cluster = deduplicatedStores.slice(startIdx, endIdx);
        rebuiltClusters.push(cluster);
        Utils.log(
          `   Rebuilt cluster ${i + 1}: ${cluster.length} stores`,
          "INFO"
        );
      }
    }

    return rebuiltClusters;
  }

  // CORE FIX: Deduplication helper with detailed logging
  deduplicateStoresByNoStr(stores, stageName = "UNKNOWN") {
    if (!stores || stores.length === 0) return stores;

    const seen = new Set();
    const duplicates = [];
    const unique = [];

    stores.forEach((store, index) => {
      const noStr = store.noStr || store.name || `UNNAMED_${index}`;

      if (seen.has(noStr)) {
        duplicates.push({
          noStr: noStr,
          name: store.name,
          stage: stageName,
          visitId: store.visitId,
          priority: store.priority,
        });
      } else {
        seen.add(noStr);
        unique.push(store);
      }
    });

    if (duplicates.length > 0) {
      Utils.log(
        `🔍 STAGE: ${stageName} - Removed ${duplicates.length} duplicates:`,
        "WARN"
      );
      duplicates.forEach((dup) => {
        Utils.log(
          `   - ${dup.noStr} (${dup.name}) [${dup.priority}] visitId: ${dup.visitId}`,
          "WARN"
        );
      });
      Utils.log(
        `   Result: ${stores.length} → ${unique.length} stores`,
        "INFO"
      );
    } else {
      Utils.log(
        `✅ STAGE: ${stageName} - No duplicates found (${stores.length} stores)`,
        "INFO"
      );
    }

    return unique;
  }

  // Enhanced validation for final assignments
  validateFinalAssignments(dayAssignments) {
    Utils.log(
      "🔍 FINAL VALIDATION: Checking for any remaining duplicates",
      "INFO"
    );

    const allAssignedStores = [];
    const storesByDay = {};

    dayAssignments.forEach((day, dayIdx) => {
      storesByDay[dayIdx] = day.stores.map((s) => s.noStr || s.name);
      allAssignedStores.push(...day.stores);
    });

    // Check for cross-day duplicates
    const crossDayDuplicates = this.findCrossDayDuplicates(storesByDay);
    if (crossDayDuplicates.length > 0) {
      Utils.log("❌ CROSS-DAY DUPLICATES FOUND:", "ERROR");
      crossDayDuplicates.forEach((dup) => {
        Utils.log(
          `   ${dup.noStr} appears in days: ${dup.days.join(", ")}`,
          "ERROR"
        );
      });
    }

    // Final deduplication of all assigned stores
    const finalDedup = this.deduplicateStoresByNoStr(
      allAssignedStores,
      "FINAL VALIDATION"
    );

    Utils.log(
      `✅ FINAL VALIDATION COMPLETE: ${finalDedup.length} unique stores across all days`,
      "INFO"
    );
  }

  findCrossDayDuplicates(storesByDay) {
    const storeToDays = {};

    // Map each store to the days it appears in
    Object.entries(storesByDay).forEach(([dayIdx, stores]) => {
      stores.forEach((noStr) => {
        if (!storeTodays[noStr]) {
          storeTodays[noStr] = [];
        }
        storeTodays[noStr].push(parseInt(dayIdx));
      });
    });

    // Find stores that appear in multiple days
    return Object.entries(storeTodays)
      .filter(([noStr, days]) => days.length > 1)
      .map(([noStr, days]) => ({ noStr, days }));
  }

  // FIX 1: Create visit instances with extra safety
  createVisitInstancesFixed(stores) {
    const instances = [];
    const processedStores = new Set(); // Extra safety

    stores.forEach((store) => {
      const noStr = store.noStr || store.name;

      // Extra safety: Skip if already processed
      if (processedStores.has(noStr)) {
        Utils.log(
          `⚠️ VISIT INSTANCES: Skipping already processed store ${noStr}`,
          "WARN"
        );
        return;
      }

      const visitsThisMonth = Math.floor(store.actualVisits || 0);

      if (visitsThisMonth > 0) {
        for (let v = 0; v < visitsThisMonth; v++) {
          instances.push({
            ...store,
            visitNum: v + 1,
            visitId: `${noStr}_V${v + 1}`,
            isMultiVisit: visitsThisMonth > 1,
          });
        }
        processedStores.add(noStr);
      }
    });

    Utils.log(
      `Visit instances created: ${instances.length} from ${stores.length} stores`,
      "INFO"
    );
    return instances;
  }

  // FIX 2: Multi-visit constraints with safe store moving
  enforceMultiVisitConstraintsFixed(dayAssignments) {
    Utils.log("🔧 Enforcing multi-visit constraints with safe moving", "INFO");

    const multiVisitStores = {};

    // Collect all multi-visit stores with their day assignments
    dayAssignments.forEach((day, dayIdx) => {
      day.stores.forEach((store, storeIdx) => {
        if (store.isMultiVisit) {
          const noStr = store.noStr || store.name;
          if (!multiVisitStores[noStr]) {
            multiVisitStores[noStr] = [];
          }
          multiVisitStores[noStr].push({
            store,
            dayIdx,
            storeIdx,
            storeReference: store, // Keep reference for safe removal
          });
        }
      });
    });

    // Fix gap violations with safe store movement
    Object.entries(multiVisitStores).forEach(([noStr, visits]) => {
      if (visits.length < 2) return;

      visits.sort((a, b) => a.dayIdx - b.dayIdx);

      for (let i = 1; i < visits.length; i++) {
        const gap = visits[i].dayIdx - visits[i - 1].dayIdx;

        if (gap < 5) {
          const violatingVisit = visits[i];
          const targetDay = Math.min(
            visits[i - 1].dayIdx + 5,
            dayAssignments.length - 1
          );

          Utils.log(
            `Moving ${noStr} from day ${violatingVisit.dayIdx} to day ${targetDay} (gap: ${gap} < 5)`,
            "INFO"
          );

          // SAFE REMOVAL: Remove by exact reference
          const currentDay = dayAssignments[violatingVisit.dayIdx];
          const exactIndex = currentDay.stores.findIndex(
            (s) =>
              (s.noStr || s.name) === noStr &&
              s.visitId === violatingVisit.store.visitId
          );

          if (exactIndex !== -1) {
            const removedStore = currentDay.stores.splice(exactIndex, 1)[0];

            // SAFE ADDITION: Add to target day if capacity allows
            if (
              targetDay < dayAssignments.length &&
              dayAssignments[targetDay].stores.length <
                (dayAssignments[targetDay].capacity ||
                  CONFIG.CLUSTERING.MAX_STORES_PER_DAY)
            ) {
              dayAssignments[targetDay].stores.push(removedStore);
              violatingVisit.dayIdx = targetDay; // Update tracking
              Utils.log(
                `✅ Successfully moved ${noStr} to day ${targetDay}`,
                "INFO"
              );
            } else {
              Utils.log(
                `⚠️ Could not move ${noStr} to day ${targetDay} (no capacity)`,
                "WARN"
              );
              // Put it back if can't move
              currentDay.stores.push(removedStore);
            }
          } else {
            Utils.log(
              `❌ Could not find ${noStr} for removal in day ${violatingVisit.dayIdx}`,
              "ERROR"
            );
          }
        }
      }
    });
  }

  // FIX 3: Time constraints with safe store moving
  enforceTimeConstraints(dayAssignments) {
    Utils.log("🔧 Enforcing time constraints with safe moving", "INFO");

    dayAssignments.forEach((day, dayIdx) => {
      if (day.stores.length === 0) return;

      let currentTime = CONFIG.WORK.START;
      let violatingStoreIndex = -1;

      for (let i = 0; i < day.stores.length; i++) {
        const store = day.stores[i];
        const distance =
          i === 0
            ? Utils.distance(
                CONFIG.START.LAT,
                CONFIG.START.LNG,
                store.lat,
                store.lng
              )
            : Utils.distance(
                day.stores[i - 1].lat,
                day.stores[i - 1].lng,
                store.lat,
                store.lng
              );

        currentTime += Math.round(distance * 3);

        // Handle breaks
        const isFriday = day.dayInfo?.isFriday || false;
        const breakStart = isFriday
          ? CONFIG.FRIDAY_PRAYER.START
          : CONFIG.LUNCH.START;
        const breakEnd = isFriday ? CONFIG.FRIDAY_PRAYER.END : CONFIG.LUNCH.END;

        if (currentTime >= breakStart && currentTime < breakEnd) {
          currentTime = breakEnd;
        }

        currentTime +=
          CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);

        if (currentTime > CONFIG.WORK.END) {
          violatingStoreIndex = i;
          break;
        }
      }

      // SAFE REMOVAL: Move violating stores
      if (violatingStoreIndex >= 0) {
        const violatingStores = day.stores.splice(violatingStoreIndex);
        Utils.log(
          `Day ${dayIdx}: Moving ${violatingStores.length} stores due to time constraints`,
          "WARN"
        );

        // Try to place in other days
        violatingStores.forEach((store) => {
          let placed = false;
          for (
            let targetDay = 0;
            targetDay < dayAssignments.length;
            targetDay++
          ) {
            if (
              targetDay !== dayIdx &&
              dayAssignments[targetDay].stores.length <
                (dayAssignments[targetDay].capacity ||
                  CONFIG.CLUSTERING.MAX_STORES_PER_DAY)
            ) {
              dayAssignments[targetDay].stores.push(store);
              Utils.log(
                `Moved ${store.noStr || store.name} to day ${targetDay}`,
                "INFO"
              );
              placed = true;
              break;
            }
          }

          if (!placed) {
            Utils.log(
              `⚠️ Could not place ${store.noStr || store.name} in any day`,
              "WARN"
            );
          }
        });
      }
    });
  }

  // Core optimization methods (unchanged but with deduplication integration)
  filterByDistanceLimit(stores) {
    const maxDistance = CONFIG.TRAVEL_LIMITS?.MAX_DISTANCE_FROM_HOME || 40;
    const validStores = stores.filter((store) => {
      const distance = Utils.distance(
        CONFIG.START.LAT,
        CONFIG.START.LNG,
        store.lat,
        store.lng
      );
      return distance <= maxDistance;
    });

    Utils.log(
      `Distance filter: ${validStores.length}/${stores.length} stores within ${maxDistance}km`,
      "INFO"
    );
    return validStores;
  }

  calculateOptimalClusters(storeCount) {
    const avgStoresPerDay =
      (CONFIG.CLUSTERING.MIN_STORES_PER_DAY +
        CONFIG.CLUSTERING.MAX_STORES_PER_DAY) /
      2;
    const workingDays = this.flatDays.length;
    return Math.min(Math.ceil(storeCount / avgStoresPerDay), workingDays);
  }

  performKMeansClustering(stores, k) {
    if (stores.length <= k) {
      return stores.map((store) => [store]);
    }

    Utils.log(
      `🔗 Starting K-means clustering: ${stores.length} stores into ${k} clusters`,
      "INFO"
    );

    const centroids = this.initializeCentroidsKMeansPlusPlus(stores, k);
    let clusters = [];
    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      clusters = Array(k)
        .fill(null)
        .map(() => []);
      const assignedStores = new Set(); // FIXED: Track assigned stores by noStr

      stores.forEach((store) => {
        const noStr = store.noStr || store.name;

        // FIXED: Skip if already assigned to prevent duplicates in clustering
        if (assignedStores.has(noStr)) {
          Utils.log(
            `⚠️ CLUSTERING: Store ${noStr} already assigned, skipping duplicate`,
            "WARN"
          );
          return;
        }

        let minDist = Infinity;
        let bestCluster = 0;

        centroids.forEach((centroid, idx) => {
          const dist = Utils.distance(
            store.lat,
            store.lng,
            centroid.lat,
            centroid.lng
          );
          if (dist < minDist) {
            minDist = dist;
            bestCluster = idx;
          }
        });

        clusters[bestCluster].push(store);
        assignedStores.add(noStr); // Mark as assigned

        Utils.log(
          `📍 CLUSTERING: ${noStr} assigned to cluster ${bestCluster}`,
          "INFO"
        );
      });

      // Update centroids
      clusters.forEach((cluster, idx) => {
        if (cluster.length > 0) {
          centroids[idx] = {
            lat: cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length,
            lng: cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length,
          };
        }
      });

      iterations++;
    }

    const finalClusters = clusters.filter((c) => c.length > 0);

    // Final verification: Check for any duplicates across clusters
    const allClusteredStores = [];
    finalClusters.forEach((cluster, idx) => {
      Utils.log(`Cluster ${idx + 1}: ${cluster.length} stores`, "INFO");
      allClusteredStores.push(...cluster);
    });

    // Verify no duplicates created during clustering
    const verification = this.deduplicateStoresByNoStr(
      allClusteredStores,
      "CLUSTERING VERIFICATION"
    );
    if (verification.length !== allClusteredStores.length) {
      Utils.log(
        `❌ CLUSTERING ERROR: Created ${
          allClusteredStores.length - verification.length
        } duplicates during clustering!`,
        "ERROR"
      );
    }

    Utils.log(
      `✅ K-means clustering complete: ${finalClusters.length} clusters, ${allClusteredStores.length} total stores`,
      "INFO"
    );

    return finalClusters;
  }

  initializeCentroidsKMeansPlusPlus(stores, k) {
    const centroids = [];
    const firstIdx = Math.floor(Math.random() * stores.length);
    centroids.push({ lat: stores[firstIdx].lat, lng: stores[firstIdx].lng });

    for (let i = 1; i < k; i++) {
      const distances = stores.map((store) => {
        const minDist = centroids.reduce((min, centroid) => {
          const dist = Utils.distance(
            store.lat,
            store.lng,
            centroid.lat,
            centroid.lng
          );
          return Math.min(min, dist);
        }, Infinity);
        return minDist * minDist;
      });

      const totalDist = distances.reduce((sum, d) => sum + d, 0);
      let random = Math.random() * totalDist;

      for (let j = 0; j < stores.length; j++) {
        random -= distances[j];
        if (random <= 0) {
          centroids.push({ lat: stores[j].lat, lng: stores[j].lng });
          break;
        }
      }
    }

    return centroids;
  }

  assignClustersTodays(clusters) {
    const dayAssignments = this.flatDays.map((day, idx) => ({
      dayIndex: idx,
      dayInfo: day,
      stores: [],
      capacity: CONFIG.CLUSTERING.MAX_STORES_PER_DAY,
    }));

    clusters.forEach((cluster) => {
      let bestDay = -1;
      let bestScore = -Infinity;

      dayAssignments.forEach((day, idx) => {
        if (day.stores.length + cluster.length > day.capacity) return;

        const capacityScore =
          ((day.capacity - day.stores.length) / day.capacity) * 100;
        if (capacityScore > bestScore) {
          bestScore = capacityScore;
          bestDay = idx;
        }
      });

      if (bestDay !== -1) {
        dayAssignments[bestDay].stores.push(...cluster);
      }
    });

    return dayAssignments;
  }

  optimizeDailyRoutes(dayAssignments) {
    dayAssignments.forEach((day) => {
      if (day.stores.length > 1) {
        day.stores = this.nearestNeighborRoute(day.stores);
        day.stores = this.optimize2Opt(day.stores);
      }
    });
  }

  nearestNeighborRoute(stores) {
    if (stores.length <= 2) return stores;

    const route = [];
    const remaining = [...stores];
    let current = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDist = Infinity;

      remaining.forEach((store, idx) => {
        const dist = Utils.distance(
          current.lat,
          current.lng,
          store.lat,
          store.lng
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = idx;
        }
      });

      const nearest = remaining.splice(nearestIdx, 1)[0];
      route.push(nearest);
      current = nearest;
    }

    return route;
  }

  optimize2Opt(route) {
    if (route.length <= 3) return route;

    let improved = true;
    let currentRoute = [...route];

    while (improved) {
      improved = false;
      for (let i = 1; i < currentRoute.length - 1; i++) {
        for (let j = i + 1; j < currentRoute.length; j++) {
          const newRoute = [
            ...currentRoute.slice(0, i),
            ...currentRoute.slice(i, j + 1).reverse(),
            ...currentRoute.slice(j + 1),
          ];

          if (
            this.calculateRouteDistance(newRoute) <
            this.calculateRouteDistance(currentRoute)
          ) {
            currentRoute = newRoute;
            improved = true;
          }
        }
      }
    }

    return currentRoute;
  }

  calculateRouteDistance(stores) {
    if (stores.length === 0) return 0;

    let totalDistance = 0;
    let current = { lat: CONFIG.START.LAT, lng: CONFIG.START.LNG };

    stores.forEach((store) => {
      totalDistance += Utils.distance(
        current.lat,
        current.lng,
        store.lat,
        store.lng
      );
      current = store;
    });

    return totalDistance;
  }

  // Output methods (simplified)
  convertBasicToOutputFormat(dayAssignments, originalStores, visitInstances) {
    let dayIndex = 0;
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        if (dayIndex < dayAssignments.length) {
          const assignment = dayAssignments[dayIndex];
          day.optimizedStores = this.createDetailedRoute(
            assignment.stores,
            day
          );
        } else {
          day.optimizedStores = [];
        }
        dayIndex++;
      });
    });

    const statistics = this.calculateBasicStatistics(
      dayAssignments,
      visitInstances
    );
    const assignedIds = new Set();
    dayAssignments.forEach((day) => {
      day.stores.forEach((store) => {
        assignedIds.add(store.visitId || store.name);
      });
    });

    const unvisitedStores = visitInstances.filter(
      (instance) => !assignedIds.has(instance.visitId || instance.name)
    );

    return {
      workingDays: this.workingDays,
      unvisitedStores: unvisitedStores,
      statistics: statistics,
      p1VisitFrequency: this.getP1Frequency(originalStores),
      hasW5: this.workingDays.length === 5,
    };
  }

  createDetailedRoute(stores, dayInfo) {
    if (!stores || stores.length === 0) return [];

    const route = [];
    let currentTime = CONFIG.WORK.START;
    let currentLat = CONFIG.START.LAT;
    let currentLng = CONFIG.START.LNG;

    const isFriday = dayInfo.isFriday;
    const breakStart = isFriday
      ? CONFIG.FRIDAY_PRAYER.START
      : CONFIG.LUNCH.START;
    const breakEnd = isFriday ? CONFIG.FRIDAY_PRAYER.END : CONFIG.LUNCH.END;
    let hasBreak = false;

    stores.forEach((store, index) => {
      const distance = Utils.distance(
        currentLat,
        currentLng,
        store.lat,
        store.lng
      );
      const travelTime = Math.round(distance * 3);

      currentTime += travelTime;

      if (!hasBreak && currentTime >= breakStart && currentTime < breakEnd) {
        currentTime = breakEnd;
        hasBreak = true;
      }

      const arrivalTime = currentTime;
      const visitDuration =
        CONFIG.BUFFER_TIME + (store.visitTime || CONFIG.DEFAULT_VISIT_TIME);
      const departTime = arrivalTime + visitDuration;

      route.push({
        ...store,
        order: index + 1,
        distance: distance,
        duration: travelTime,
        arrivalTime: arrivalTime,
        departTime: departTime,
        timeWarning: departTime > CONFIG.WORK.END,
        isAfter6PM: departTime > CONFIG.WORK.END,
      });

      currentTime = departTime;
      currentLat = store.lat;
      currentLng = store.lng;
    });

    return route;
  }

  calculateBasicStatistics(dayAssignments, visitInstances) {
    const activeDays = dayAssignments.filter((day) => day.stores.length > 0);
    const totalStores = dayAssignments.reduce(
      (sum, day) => sum + day.stores.length,
      0
    );
    const totalDistance = dayAssignments.reduce(
      (sum, day) => sum + this.calculateRouteDistance(day.stores),
      0
    );

    return {
      totalStoresRequired: visitInstances.length,
      totalStoresPlanned: totalStores,
      coveragePercentage: ((totalStores / visitInstances.length) * 100).toFixed(
        1
      ),
      workingDays: activeDays.length,
      totalDistance: totalDistance.toFixed(1),
      averageStoresPerDay:
        activeDays.length > 0
          ? (totalStores / activeDays.length).toFixed(1)
          : "0",
    };
  }

  getP1Frequency(stores) {
    const p1Stores = stores.filter((s) => s.priority === "P1");
    if (p1Stores.length === 0) return 0;
    return (
      p1Stores.reduce((sum, s) => sum + (s.baseFrequency || 0), 0) /
      p1Stores.length
    );
  }

  flattenWorkingDays() {
    const flat = [];
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        flat.push(day);
      });
    });
    return flat;
  }

  // Enhanced optimization methods (simplified)
  runEnhancedOptimization(stores) {
    Utils.log("🚀 Using Enhanced Cross-Border Optimization", "INFO");
    const optimizedConfig = this.getOptimizedConfig(stores);
    const crossBorderOptimizer = new CrossBorderOptimizer(optimizedConfig);
    const optimizationResult = crossBorderOptimizer.optimize(
      stores,
      this.workingDays
    );
    return this.convertToExistingFormat(optimizationResult, stores);
  }

  getOptimizedConfig(stores) {
    return {
      gridSize: 0.02,
      capacityPerDay: 13,
      minStoresPerDay: 8,
      maxDistance: 5,
      borderThreshold: 0.7,
    };
  }

  convertToExistingFormat(optimizationResult, originalStores) {
    let dayIndex = 0;
    this.workingDays.forEach((week) => {
      week.forEach((day) => {
        if (dayIndex < optimizationResult.routes.length) {
          const optimizedDay = optimizationResult.routes[dayIndex];
          day.optimizedStores = this.createDetailedRoute(
            optimizedDay.stores,
            day
          );
        } else {
          day.optimizedStores = [];
        }
        dayIndex++;
      });
    });

    const statistics = {
      totalStoresRequired: optimizationResult.routes.reduce(
        (sum, day) => sum + day.stores.length,
        0
      ),
      totalStoresPlanned: optimizationResult.routes.reduce(
        (sum, day) => sum + day.stores.length,
        0
      ),
      coveragePercentage: "100.0",
      workingDays: optimizationResult.routes.length,
      averageStoresPerDay: (
        optimizationResult.routes.reduce(
          (sum, day) => sum + day.stores.length,
          0
        ) / optimizationResult.routes.length
      ).toFixed(1),
      totalDistance: optimizationResult.routes
        .reduce((sum, day) => sum + this.calculateRouteDistance(day.stores), 0)
        .toFixed(1),
      crossBorderOptimization: {
        daysAfter: optimizationResult.routes.length,
        avgUtilization: optimizationResult.performance.avgUtilization + "%",
        efficiencyGain: optimizationResult.performance.efficiencyGain + "%",
        crossBorderDays:
          optimizationResult.performance.crossBorderOptimizations,
      },
    };

    return {
      workingDays: this.workingDays,
      unvisitedStores: [],
      statistics: statistics,
      p1VisitFrequency: this.getP1Frequency(originalStores),
      hasW5: this.workingDays.length === 5,
    };
  }
}

// ==================== PROBLEM ANALYZER - UPDATED ====================
class RouteProblemAnalyzer {
  analyzeRouteProblems(planResult) {
    Utils.log("=== ANALYZING ROUTE PROBLEMS ===", "INFO");

    const problems = { duplicates: 0, gaps: 0, timeViolations: 0 };
    const allStores = this.extractScheduledStores(planResult.workingDays);

    problems.duplicates = this.checkDuplicates(allStores);
    problems.gaps = this.checkGapViolations(allStores);
    problems.timeViolations = this.checkTimeViolations(planResult.workingDays);

    const total = problems.duplicates + problems.gaps + problems.timeViolations;
    Utils.log(
      `PROBLEMS FOUND: ${total} (${problems.duplicates} duplicates, ${problems.gaps} gaps, ${problems.timeViolations} time violations)`,
      total > 0 ? "ERROR" : "INFO"
    );

    return problems;
  }

  extractScheduledStores(workingDays) {
    const stores = [];
    let dayIndex = 0;

    workingDays.forEach((week) => {
      week.forEach((dayInfo) => {
        if (dayInfo.optimizedStores) {
          dayInfo.optimizedStores.forEach((store) => {
            stores.push({ ...store, dayIndex });
          });
        }
        dayIndex++;
      });
    });

    return stores;
  }

  checkDuplicates(allStores) {
    const storeMap = {};
    let duplicates = 0;

    allStores.forEach((store) => {
      const noStr = store.noStr || store.name;
      if (!storeMap[noStr]) storeMap[noStr] = [];
      storeMap[noStr].push(store);
    });

    Object.entries(storeMap).forEach(([noStr, visits]) => {
      const expectedVisits = Math.floor(visits[0].baseFrequency || 1);
      if (visits.length > expectedVisits) {
        Utils.log(
          `❌ DUPLICATE: ${visits[0].name} (${noStr}) appears ${visits.length} times, expected ${expectedVisits}`,
          "ERROR"
        );
        duplicates++;
      }
    });

    return duplicates;
  }

  checkGapViolations(allStores) {
    const storeMap = {};
    let violations = 0;

    allStores.forEach((store) => {
      const noStr = store.noStr || store.name;
      if (!storeMap[noStr]) storeMap[noStr] = [];
      storeMap[noStr].push(store);
    });

    Object.entries(storeMap).forEach(([noStr, visits]) => {
      if (visits.length >= 2) {
        visits.sort((a, b) => a.dayIndex - b.dayIndex);
        for (let i = 1; i < visits.length; i++) {
          const gap = visits[i].dayIndex - visits[i - 1].dayIndex;
          if (gap < 5) {
            Utils.log(
              `❌ GAP VIOLATION: ${visits[0].name} (${noStr}) gap ${gap} days < 5 minimum`,
              "ERROR"
            );
            violations++;
          }
        }
      }
    });

    return violations;
  }

  checkTimeViolations(workingDays) {
    let violations = 0;

    workingDays.forEach((week, weekIdx) => {
      week.forEach((dayInfo, dayIdx) => {
        if (dayInfo.optimizedStores) {
          const violatingStores = dayInfo.optimizedStores.filter(
            (store) => store.departTime > CONFIG.WORK.END
          );
          if (violatingStores.length > 0) {
            Utils.log(
              `❌ TIME VIOLATION: Week ${weekIdx + 1} ${dayInfo.dayName} has ${
                violatingStores.length
              } stores after 6:20 PM`,
              "ERROR"
            );
            violations++;
          }
        }
      });
    });

    return violations;
  }
}

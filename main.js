/* global geotab, L */

geotab.addin.heatmap = function () {
  'use strict';

  var api;
  var state;
  var map;
  var heatLayer;

  var elements = {};

  // ---------- DOM helpers ----------

  function $(id) {
    return document.getElementById(id);
  }

  function getSelectedValues(selectEl) {
    var values = [];
    for (var i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].selected && selectEl.options[i].value) {
        values.push(selectEl.options[i].value);
      }
    }
    return values;
  }

  function clearOptions(selectEl, keepFirst) {
    var start = keepFirst ? 1 : 0;
    while (selectEl.options.length > start) {
      selectEl.remove(start);
    }
  }

  function showError(message) {
    elements.error.textContent = message || '';
  }

  function showMessage(message) {
    elements.message.textContent = message || '';
  }

  function setLoading(isLoading) {
    elements.loading.style.display = isLoading ? 'block' : 'none';
    elements.showHeatMap.disabled = isLoading;
  }

  // ---------- Map ----------

  function initMap() {
    map = L.map('heatmap-map').setView([43.4516, -79.7077], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);
  }

  function renderHeat(points) {
    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
    }

    if (!points.length) {
      showMessage('No data found for the selected criteria.');
      return;
    }

    heatLayer = L.heatLayer(points, { radius: 18, blur: 22, maxZoom: 14 }).addTo(map);

    var bounds = L.latLngBounds(points.map(function (p) { return [p[0], p[1]]; }));
    map.fitBounds(bounds, { padding: [20, 20] });

    showMessage('Showing ' + points.length + ' point(s).');
  }

  // ---------- Data loading: dropdowns ----------

  function loadVehicles() {
    return api.callAsync('Get', {
      typeName: 'Device',
      search: { fromDate: new Date().toISOString() }
    }).then(function (devices) {
      clearOptions(elements.vehicles, false);
      devices
        .slice()
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
        .forEach(function (device) {
          var opt = document.createElement('option');
          opt.value = device.id;
          opt.textContent = device.name;
          elements.vehicles.appendChild(opt);
        });
    });
  }

  function loadDrivers() {
    return api.callAsync('Get', {
      typeName: 'User',
      search: { isDriver: true }
    }).then(function (users) {
      clearOptions(elements.drivers, true); // keep "All Drivers" option
      users
        .filter(function (u) { return !u.isDriver === false; }) // isDriver true already filtered server-side
        .sort(function (a, b) {
          var an = (a.name || (a.firstName + ' ' + a.lastName) || '');
          var bn = (b.name || (b.firstName + ' ' + b.lastName) || '');
          return an.localeCompare(bn);
        })
        .forEach(function (user) {
          var opt = document.createElement('option');
          opt.value = user.id;
          opt.textContent = user.name || ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.id;
          elements.drivers.appendChild(opt);
        });
    });
  }

  function loadExceptionRules() {
    return api.callAsync('Get', { typeName: 'Rule' }).then(function (rules) {
      clearOptions(elements.exceptionTypes, false);
      var placeholder = document.createElement('option');
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = 'Select a rule';
      elements.exceptionTypes.appendChild(placeholder);

      rules
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
        .forEach(function (rule) {
          var opt = document.createElement('option');
          opt.value = rule.id;
          opt.textContent = rule.name;
          elements.exceptionTypes.appendChild(opt);
        });
    });
  }

  // ---------- Query helpers ----------

  function toIsoOrUndefined(value) {
    if (!value) {
      return undefined;
    }
    var d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  function chunk(array, size) {
    var result = [];
    for (var i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  // Resolve {deviceId, fromDate, toDate} windows for the selected driver(s)
  // within the overall date range, using the Trip entity (which has a
  // native `driver` reference). LogRecord itself has no driver field,
  // so this join is required to filter location history by driver.
  function resolveDriverTripWindows(driverIds, vehicleIds, fromDate, toDate) {
    var driverSearches = driverIds.length ? driverIds : [null];

    var calls = driverSearches.map(function (driverId) {
      var search = {
        fromDate: fromDate,
        toDate: toDate
      };
      if (driverId) {
        search.driverSearch = { id: driverId };
      }
      if (vehicleIds.length === 1) {
        search.deviceSearch = { id: vehicleIds[0] };
      }
      return ['Get', { typeName: 'Trip', search: search }];
    });

    return api.multiCallAsync(calls).then(function (results) {
      var windows = [];
      results.forEach(function (trips) {
        trips.forEach(function (trip) {
          if (!trip.device || !trip.device.id) {
            return;
          }
          if (vehicleIds.length && vehicleIds.indexOf(trip.device.id) === -1) {
            return;
          }
          windows.push({
            deviceId: trip.device.id,
            fromDate: trip.start,
            toDate: trip.stop
          });
        });
      });
      return windows;
    });
  }

  function fetchLogRecordsForWindows(windows) {
    if (!windows.length) {
      return Promise.resolve([]);
    }

    var batches = chunk(windows, 50); // keep multicalls a reasonable size
    var batchPromises = batches.map(function (batch) {
      var calls = batch.map(function (w) {
        return ['Get', {
          typeName: 'LogRecord',
          search: {
            deviceSearch: { id: w.deviceId },
            fromDate: w.fromDate,
            toDate: w.toDate
          }
        }];
      });
      return api.multiCallAsync(calls);
    });

    return Promise.all(batchPromises).then(function (batchResults) {
      var all = [];
      batchResults.forEach(function (results) {
        results.forEach(function (records) {
          all = all.concat(records);
        });
      });
      return all;
    });
  }

  function fetchLogRecordsByDevice(vehicleIds, fromDate, toDate) {
    var deviceIds = vehicleIds.length ? vehicleIds : [null];

    var calls = deviceIds.map(function (deviceId) {
      var search = { fromDate: fromDate, toDate: toDate };
      if (deviceId) {
        search.deviceSearch = { id: deviceId };
      }
      return ['Get', { typeName: 'LogRecord', search: search }];
    });

    return api.multiCallAsync(calls).then(function (results) {
      var all = [];
      results.forEach(function (records) {
        all = all.concat(records);
      });
      return all;
    });
  }

  function fetchExceptionEvents(vehicleIds, driverIds, ruleId, fromDate, toDate) {
    var deviceIds = vehicleIds.length ? vehicleIds : [null];
    var driverSearches = driverIds.length ? driverIds : [null];

    var calls = [];
    deviceIds.forEach(function (deviceId) {
      driverSearches.forEach(function (driverId) {
        var search = {
          fromDate: fromDate,
          toDate: toDate,
          ruleSearch: { id: ruleId }
        };
        if (deviceId) {
          search.deviceSearch = { id: deviceId };
        }
        if (driverId) {
          search.driverSearch = { id: driverId };
        }
        calls.push(['Get', { typeName: 'ExceptionEvent', search: search }]);
      });
    });

    return api.multiCallAsync(calls).then(function (results) {
      var all = [];
      results.forEach(function (events) {
        all = all.concat(events);
      });
      return all;
    });
  }

  // We need lat/lng for exception events; they reference LogRecord-like
  // positional data only indirectly in some configurations, so for events
  // that already carry a location we use it directly, otherwise we skip them.
  function exceptionEventsToPoints(events) {
    return events
      .filter(function (e) { return typeof e.latitude === 'number' && typeof e.longitude === 'number'; })
      .map(function (e) { return [e.latitude, e.longitude, 0.5]; });
  }

  function logRecordsToPoints(records) {
    return records
      .filter(function (r) { return typeof r.latitude === 'number' && typeof r.longitude === 'number'; })
      .map(function (r) { return [r.latitude, r.longitude, 0.5]; });
  }

  // ---------- Main search ----------

  function runSearch() {
    showError('');
    showMessage('');

    var visualizeBy = document.querySelector('input[name="visualizeBy"]:checked').value;
    var vehicleIds = getSelectedValues(elements.vehicles);
    var driverIds = getSelectedValues(elements.drivers);
    var fromDate = toIsoOrUndefined(elements.from.value);
    var toDate = toIsoOrUndefined(elements.to.value);

    if (!fromDate || !toDate) {
      showError('Please specify both a From and To date/time.');
      return;
    }

    if (visualizeBy === 'exceptionHistory') {
      var ruleId = elements.exceptionTypes.value;
      if (!ruleId) {
        showError('Please select a rule for Exception History.');
        return;
      }

      setLoading(true);
      fetchExceptionEvents(vehicleIds, driverIds, ruleId, fromDate, toDate)
        .then(function (events) {
          renderHeat(exceptionEventsToPoints(events));
        })
        .catch(function (err) {
          showError('Error fetching exception history: ' + (err && err.message ? err.message : err));
        })
        .then(function () {
          setLoading(false);
        });

      return;
    }

    // Location History
    setLoading(true);

    if (driverIds.length) {
      // Driver filter requires resolving Trip windows first, since
      // LogRecord has no native driver field.
      resolveDriverTripWindows(driverIds, vehicleIds, fromDate, toDate)
        .then(function (windows) {
          showMessage('Resolved ' + windows.length + ' trip window(s) for selected driver(s)\u2026');
          return fetchLogRecordsForWindows(windows);
        })
        .then(function (records) {
          renderHeat(logRecordsToPoints(records));
        })
        .catch(function (err) {
          showError('Error fetching location history by driver: ' + (err && err.message ? err.message : err));
        })
        .then(function () {
          setLoading(false);
        });
    } else {
      fetchLogRecordsByDevice(vehicleIds, fromDate, toDate)
        .then(function (records) {
          renderHeat(logRecordsToPoints(records));
        })
        .catch(function (err) {
          showError('Error fetching location history: ' + (err && err.message ? err.message : err));
        })
        .then(function () {
          setLoading(false);
        });
    }
  }

  // ---------- UI wiring ----------

  function onVisualizeByChange() {
    var visualizeBy = document.querySelector('input[name="visualizeBy"]:checked').value;
    elements.exceptionTypes.disabled = visualizeBy !== 'exceptionHistory';
  }

  function bindElements() {
    elements.vehicles = $('vehicles');
    elements.drivers = $('drivers');
    elements.exceptionTypes = $('exceptionTypes');
    elements.from = $('from');
    elements.to = $('to');
    elements.showHeatMap = $('showHeatMap');
    elements.error = $('error');
    elements.message = $('message');
    elements.loading = $('loading');
  }

  function bindEvents() {
    elements.showHeatMap.addEventListener('click', function (event) {
      event.preventDefault();
      runSearch();
    });

    var radios = document.querySelectorAll('input[name="visualizeBy"]');
    radios.forEach(function (radio) {
      radio.addEventListener('change', onVisualizeByChange);
    });

    // Selecting "All Drivers" clears any other driver selection, and vice versa.
    elements.drivers.addEventListener('change', function () {
      var options = elements.drivers.options;
      var allDriversOption = options[0];
      var anySpecificSelected = false;

      for (var i = 1; i < options.length; i++) {
        if (options[i].selected) {
          anySpecificSelected = true;
          break;
        }
      }

      if (anySpecificSelected) {
        allDriversOption.selected = false;
      } else {
        allDriversOption.selected = true;
      }
    });
  }

  return {
    initialize: function (freshApi, freshState, callback) {
      api = freshApi;
      state = freshState;

      bindElements();
      bindEvents();
      initMap();

      callback();
    },

    focus: function (freshApi, freshState) {
      api = freshApi;
      state = freshState;

      setLoading(true);
      Promise.all([loadVehicles(), loadDrivers(), loadExceptionRules()])
        .catch(function (err) {
          showError('Error loading filter options: ' + (err && err.message ? err.message : err));
        })
        .then(function () {
          setLoading(false);
          if (map) {
            // MyGeotab panel can be resized/hidden between focus events.
            setTimeout(function () { map.invalidateSize(); }, 0);
          }
        });
    },

    blur: function () {
      // Nothing to persist between views in this sample.
    }
  };
};

/**
 * SA Network Coverage Map Add-In
 * Geotab Map Add-In (page: "map")
 *
 * Embeds Vodacom and MTN coverage maps in a side panel.
 * Optionally syncs to the selected vehicle's last known location.
 *
 * Geotab Map Add-In entry point — called by MyGeotab when the
 * user visits the Map page and clicks the "SA Coverage" tab.
 */

/* ── State ──────────────────────────────────────────────── */
var sacoverage = {
  activeNetwork: 'vodacom',
  geotabApi: null,
  geotabState: null,
  lastVehicleLat: null,
  lastVehicleLng: null,
  selectedDeviceId: null,

  networks: {
    vodacom: {
      name: 'Vodacom',
      baseUrl: 'https://vccoverage.afrigis.co.za/#/',
      badgeClass: 'vodacom',
      badgeText: 'Vodacom Coverage Map',
      footerText: 'vodacom.co.za',
      footerUrl: 'https://vccoverage.afrigis.co.za/',
      tabId: 'tab-vodacom',
      activeClass: 'active-vodacom'
    },
    mtn: {
      name: 'MTN',
      // MTN's coverage map — embedded via their hosted map page
      baseUrl: 'https://mtnsi.mtn.co.za/coverage/map3.html',
      badgeClass: 'mtn',
      badgeText: 'MTN Coverage Map',
      footerText: 'mtn.co.za',
      footerUrl: 'https://www.mtn.co.za/home/coverage/',
      tabId: 'tab-mtn',
      activeClass: 'active-mtn'
    }
  }
};

/* ── Geotab Map Add-In Interface ────────────────────────── */
geotab.addin.saCoverageAddin = function (elt, service) {

  // ── Initialize: called once when user opens this Add-In tab
  return {
    initialize: function (api, state, callback) {
      sacoverage.geotabApi = api;
      sacoverage.geotabState = state;

      // Listen for map vehicle selection changes
      service.events.attach('selectedEntity', function (entity) {
        if (entity && entity.id) {
          sacoverage.selectedDeviceId = entity.id;
          sacoverage.fetchDeviceLocation(entity.id);
        }
      });

      // Handle iframe load events
      var frame = document.getElementById('coverageFrame');
      if (frame) {
        frame.addEventListener('load', function () {
          sacoverage.hideLoading();
        });
        // Fallback: hide loading after 8s even if load event is unreliable
        setTimeout(function () { sacoverage.hideLoading(); }, 8000);
      }

      if (typeof callback === 'function') callback();
    },

    focus: function (api, state) {
      // Re-check if a vehicle is already selected on the map
      try {
        var currentEntity = state.getSelectedEntity ? state.getSelectedEntity() : null;
        if (currentEntity && currentEntity.id) {
          sacoverage.selectedDeviceId = currentEntity.id;
          sacoverage.fetchDeviceLocation(currentEntity.id);
        }
      } catch (e) {
        // No entity selected — that's fine
      }
    },

    blur: function (api, state) {
      // Nothing to clean up
    }
  };
};

/* ── Network switching ──────────────────────────────────── */
function switchNetwork(network) {
  if (sacoverage.activeNetwork === network) return;

  sacoverage.activeNetwork = network;
  var nets = sacoverage.networks;
  var active = nets[network];
  var inactive = network === 'vodacom' ? nets.mtn : nets.vodacom;

  // Update tab styles
  var activeTab = document.getElementById(active.tabId);
  var inactiveTab = document.getElementById(inactive.tabId);
  if (activeTab) {
    activeTab.className = 'tab-btn ' + active.activeClass;
  }
  if (inactiveTab) {
    inactiveTab.className = 'tab-btn';
  }

  // Update badge
  var badge = document.getElementById('networkBadge');
  if (badge) {
    badge.className = 'network-badge ' + active.badgeClass;
  }
  var badgeText = document.getElementById('badgeText');
  if (badgeText) badgeText.textContent = active.badgeText;

  // Update footer
  var footerLink = document.getElementById('footerLink');
  if (footerLink) {
    footerLink.innerHTML = '<a href="' + active.footerUrl + '" target="_blank">' + active.footerText + '</a>';
  }

  // Show loading, switch iframe src
  sacoverage.showLoading();
  var frame = document.getElementById('coverageFrame');
  if (frame) {
    // Build URL, appending coords if we have them
    var url = sacoverage.buildUrl(active.baseUrl);
    frame.src = url;

    // Fallback hide loading
    setTimeout(function () { sacoverage.hideLoading(); }, 8000);
  }
}

/* ── URL builder (append lat/lng if available) ───────────── */
sacoverage.buildUrl = function (baseUrl) {
  // Both maps accept lat/lng as hash fragments or query params.
  // Vodacom/AfriGIS: appending #lat,lng,zoom works for map centering.
  // MTN map3: accepts ?lat=&lng= query params.
  if (!sacoverage.lastVehicleLat || !sacoverage.lastVehicleLng) {
    return baseUrl;
  }

  var lat = sacoverage.lastVehicleLat.toFixed(5);
  var lng = sacoverage.lastVehicleLng.toFixed(5);

  if (sacoverage.activeNetwork === 'vodacom') {
    // AfriGIS hash format: #/lat,lng,zoom
    return 'https://vccoverage.afrigis.co.za/#/' + lat + ',' + lng + ',13';
  } else {
    // MTN map3 accepts query string for centering
    return 'https://mtnsi.mtn.co.za/coverage/map3.html?lat=' + lat + '&lng=' + lng + '&zoom=13';
  }
};

/* ── Vehicle location sync ───────────────────────────────── */
function useVehicleLocation() {
  if (!sacoverage.geotabApi) {
    sacoverage.showToast('Geotab API not available');
    return;
  }

  if (sacoverage.selectedDeviceId) {
    sacoverage.fetchDeviceLocation(sacoverage.selectedDeviceId);
  } else {
    // Try to get any live device
    sacoverage.geotabApi.call(
      'Get',
      {
        typeName: 'DeviceStatusInfo',
        search: { deviceSearch: {} }
      },
      function (results) {
        if (results && results.length > 0) {
          // Use the first device with a known location
          var found = null;
          for (var i = 0; i < results.length; i++) {
            if (results[i].latitude && results[i].longitude) {
              found = results[i];
              break;
            }
          }
          if (found) {
            sacoverage.applyLocation(found.latitude, found.longitude, 'First active vehicle');
          } else {
            sacoverage.showToast('No vehicle locations found');
          }
        } else {
          sacoverage.showToast('Select a vehicle on the map first');
        }
      },
      function (err) {
        sacoverage.showToast('Could not fetch vehicle location');
        console.error('[SA Coverage] DeviceStatusInfo error:', err);
      }
    );
  }
}

sacoverage.fetchDeviceLocation = function (deviceId) {
  if (!sacoverage.geotabApi) return;

  sacoverage.geotabApi.call(
    'Get',
    {
      typeName: 'DeviceStatusInfo',
      search: { deviceSearch: { id: deviceId } }
    },
    function (results) {
      if (results && results.length > 0) {
        var info = results[0];
        if (info.latitude && info.longitude) {
          sacoverage.applyLocation(info.latitude, info.longitude, info.device && info.device.name ? info.device.name : 'Vehicle');
        } else {
          sacoverage.showToast('Vehicle location not available');
        }
      }
    },
    function (err) {
      console.error('[SA Coverage] Location fetch error:', err);
    }
  );
};

sacoverage.applyLocation = function (lat, lng, label) {
  sacoverage.lastVehicleLat = lat;
  sacoverage.lastVehicleLng = lng;

  // Update location button
  var btn = document.getElementById('locationBtn');
  if (btn) {
    btn.textContent = '📍 ' + (label || 'Vehicle') + ' (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
    btn.className = 'location-btn has-location';
  }

  // Reload iframe with new location
  sacoverage.showLoading();
  var frame = document.getElementById('coverageFrame');
  var active = sacoverage.networks[sacoverage.activeNetwork];
  if (frame && active) {
    frame.src = sacoverage.buildUrl(active.baseUrl);
    setTimeout(function () { sacoverage.hideLoading(); }, 8000);
  }

  sacoverage.showToast('Centred on ' + (label || 'vehicle'));
};

/* ── Open external ───────────────────────────────────────── */
function openExternal() {
  var active = sacoverage.networks[sacoverage.activeNetwork];
  if (active) {
    window.open(active.footerUrl, '_blank', 'noopener');
  }
}

/* ── Loading helpers ─────────────────────────────────────── */
sacoverage.showLoading = function () {
  var overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('hidden');
};

sacoverage.hideLoading = function () {
  var overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
};

/* ── Toast notification ──────────────────────────────────── */
sacoverage.showToast = function (msg) {
  var toast = document.getElementById('locationToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function () {
    toast.classList.remove('show');
  }, 2800);
};

if (typeof GeolocationSpoof === 'undefined') {
  class GeolocationSpoof {
    constructor() {
      this.settings = null;
      this.interval = null;
      this.currentLat = null;
      this.currentLng = null;
      this.overrideGeolocation();
      this.setupMessageListener();
    }

    overrideGeolocation() {
      const originalGeolocation = navigator.geolocation;

      const spoof = {
        getCurrentPosition: (success, error, options) => {
          try {
            const position = this.generatePosition();
            success(position);
          } catch (e) {
            if (error) {
              error({
                code: 2,
                message: e.message
              });
            }
          }
        },

        watchPosition: (success, error, options) => {
          if (!this.settings || !this.settings.enabled) {
            this.stop();
            return originalGeolocation.watchPosition(success, error, options);
          }

          const callback = () => {
            try {
              const position = this.generatePosition();
              success(position);
            } catch (e) {
              if (error) error(e);
            }
          };

          callback();
          this.interval = setInterval(callback, 1000);
          return Date.now();
        },

        clearWatch: (id) => {
          if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
          }
        }
      };

      Object.defineProperty(navigator, 'geolocation', {
        value: spoof,
        configurable: true,
        writable: true
      });
    }

    generatePosition() {
      if (!this.settings || !this.settings.enabled) {
        throw new Error('Spoofing not enabled');
      }

      let lat = this.currentLat ?? this.settings.lat;
      let lng = this.currentLng ?? this.settings.lng;

      if (this.settings.randomize && this.settings.randomRange > 0) {
        const rangeMeters = this.settings.randomRange;
        const latOffset = (Math.random() - 0.5) * rangeMeters / 111111;
        const lngOffset = (Math.random() - 0.5) * rangeMeters / (111111 * Math.cos(lat * Math.PI / 180));
        lat += latOffset;
        lng += lngOffset;
      }

      this.currentLat = lat;
      this.currentLng = lng;

      const position = {
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: this.settings.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: this.settings.heading || null,
          speed: this.settings.gpsSpeed || null
        },
        timestamp: Date.now()
      };

      if (this.settings.mode === 'moving') {
        this.updateMovingPosition();
      }

      return position;
    }

    updateMovingPosition() {
      if (this.settings.speed <= 0) return;

      const speedMps = this.settings.speed * 1000 / 3600;
      const bearingRad = this.settings.bearing * Math.PI / 180;
      const latRad = this.currentLat * Math.PI / 180;

      const R = 6371000;
      const angularSpeed = speedMps / R;

      const deltaLat = angularSpeed * Math.cos(bearingRad);
      const deltaLng = angularSpeed * Math.sin(bearingRad) / Math.cos(latRad);

      this.currentLat += deltaLat * (180 / Math.PI);
      this.currentLng += deltaLng * (180 / Math.PI);
    }

    setupMessageListener() {
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        if (event.data.action === 'start') {
          this.settings = event.data.settings;
          this.currentLat = this.settings.lat;
          this.currentLng = this.settings.lng;
        } else if (event.data.action === 'stop') {
          this.stop();
        } else if (event.data.action === 'update') {
          this.settings = event.data.settings;
        }
      });
    }

    stop() {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      this.settings = null;
      this.currentLat = null;
      this.currentLng = null;
    }
  }

  const spoof = new GeolocationSpoof();
}

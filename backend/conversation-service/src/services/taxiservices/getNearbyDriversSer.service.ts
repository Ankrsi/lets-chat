import { redisClient } from "../../redis/redisClient";

interface DriverLocation {
  driverId: string;
  location: {
    lng: number;
    lat: number;
  };
  // Straight-line km from the search point. Redis already computes this for the
  // radius check (WITHDIST), so callers get it for free — no Distance Matrix call
  // needed just to rank drivers by how close they are.
  distanceKm: number;
}

export class getNearbyDriversSer {
  static async getNearbyDrivers(
    latitude: number,
    longitude: number,
    radiusKm: number,
  ): Promise<DriverLocation[]> {
    console.info("\n-------------------------------------------");
    console.info("🔵 START: Fetching nearby drivers from Redis");
    console.info(`📍 Input => lat=${latitude}, lng=${longitude}, radius=${radiusKm}km`);
    console.info("-------------------------------------------");

    try {
      console.info("🔍 Using GEORADIUS to find nearby drivers...");

      const rawResult = await redisClient.sendCommand([
        "GEORADIUS",
        "driver_locations",
        longitude.toString(),
        latitude.toString(),
        radiusKm.toString(),
        "km",
        "WITHDIST",
        "WITHCOORD",
        "COUNT",
        "100",
        "ASC", // nearest first
      ]);

      console.info("🟢 GEORADIUS raw result =", rawResult);

      if (!rawResult || !Array.isArray(rawResult)) {
        console.info("⚠️ GEORADIUS returned invalid result");
        return [];
      }

      const results: DriverLocation[] = [];

      for (const item of rawResult) {
        console.info("🔎 Parsing GEORADIUS item =", item);

        if (Array.isArray(item) && item.length >= 3) {
          const driverId = String(item[0]);
          const distanceKm = parseFloat(String(item[1]));
          const coords = item[2];

          if (Array.isArray(coords) && coords.length >= 2) {
            const driverData = {
              driverId,
              location: {
                lng: parseFloat(String(coords[0])),
                lat: parseFloat(String(coords[1])),
              },
              distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
            };

            console.info("🟢 Driver Found ->", driverData);

            results.push(driverData);
          } else {
            console.info("⚠️ Invalid coords for driver", item);
          }
        } else {
          console.info("⚠️ Invalid item structure", item);
        }
      }

      console.info("🟦 FINAL NEARBY DRIVERS =", results.map(d => d.driverId));
      return results;
    } catch (error) {
      console.error("❌ GEORADIUS failed:", error);

      console.info("🔄 Switching to GEOSEARCH fallback...");

      try {
        const altResult = await redisClient.sendCommand([
          "GEOSEARCH",
          "driver_locations",
          "FROMLONLAT",
          longitude.toString(),
          latitude.toString(),
          "BYRADIUS",
          radiusKm.toString(),
          "km",
          "ASC", // nearest first
          "WITHDIST",
          "WITHCOORD",
        ]);

        console.info("🟢 GEOSEARCH raw result =", altResult);

        if (!altResult || !Array.isArray(altResult)) {
          console.info("⚠️ GEOSEARCH returned invalid result");
          return [];
        }

        const results: DriverLocation[] = [];

        for (const item of altResult) {
          console.info("🔎 Parsing GEOSEARCH item =", item);

          if (Array.isArray(item) && item.length >= 3) {
            const driverId = String(item[0]);
            const distanceKm = parseFloat(String(item[1]));
            const coords = item[2];

            if (Array.isArray(coords) && coords.length >= 2) {
              const driverData = {
                driverId,
                location: {
                  lng: parseFloat(String(coords[0])),
                  lat: parseFloat(String(coords[1])),
                },
                distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
              };

              console.info("🟢 Driver Found (fallback) ->", driverData);

              results.push(driverData);
            } else {
              console.info("⚠️ Invalid coords in fallback", item);
            }
          } else {
            console.info("⚠️ Invalid fallback item structure", item);
          }
        }

        console.info("🟦 FINAL NEARBY DRIVERS (fallback) =", results.map(d => d.driverId));
        return results;
      } catch (altError) {
        console.error("❌ Fallback GEOSEARCH also failed:", altError);
        throw error;
      }
    }
  }

  // Add driver location
  static async addDriverLocation(
    driverId: string,
    longitude: number,
    latitude: number,
  ): Promise<void> {
    console.info("\n-------------------------------------------");
    console.info(`🔵 Adding/Updating Driver Location => driverId=${driverId}`);
    console.info(`📍 Coords => lat=${latitude}, lng=${longitude}`);
    console.info("-------------------------------------------");

    try {
      await redisClient.sendCommand([
        "GEOADD",
        "driver_locations",
        longitude.toString(),
        latitude.toString(),
        driverId,
      ]);

      console.info(`🟢 SUCCESS: Driver ${driverId} location added/updated`);
    } catch (error) {
      console.error("❌ Error adding driver location:", error);
      throw error;
    }
  }

  // Get all drivers
  static async getAllDrivers(): Promise<string[]> {
    console.info("\n-------------------------------------------");
    console.info("🔵 Fetching ALL drivers from Redis");
    console.info("-------------------------------------------");

    try {
      const result = await redisClient.sendCommand(["ZRANGE", "driver_locations", "0", "-1"]);

      console.info("🟢 Raw Driver List =", result);

      const finalList = Array.isArray(result) ? result.map(String) : [];

      console.info("🟦 FINAL DRIVER LIST =", finalList);

      return finalList;
    } catch (error) {
      console.error("❌ Error getting all drivers:", error);
      return [];
    }
  }
}

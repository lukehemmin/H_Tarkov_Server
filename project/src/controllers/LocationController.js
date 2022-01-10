"use strict";

require("../Lib.js");

class LocationController
{
    /* generates a random location preset to use for local session */
    static generate(name)
    {
        const location = DatabaseServer.tables.locations[name];
        const output = location.base;
        const ids = {};

        output.UnixDateTime = TimeUtil.getTimestamp();

        // don't generate loot on hideout
        if (name === "hideout")
        {
            return output;
        }

        // generate loot
        const forced = location.loot.forced;
        const mounted = location.loot.mounted;
        const statics = JsonUtil.clone(location.loot.static);
        const dynamic = JsonUtil.clone(location.loot.dynamic);
        output.Loot = [];

        // mounted weapons
        for (const i in mounted)
        {
            const data = mounted[i];

            if (data.Id in ids)
                continue;

            ids[data.Id] = true;
            output.Loot.push(data);
        }

        // forced loot
        for (const i in forced)
        {
            const data = forced[i].data[0];

            if (data.Id in ids)
                continue;

            ids[data.Id] = true;
            output.Loot.push(data);
        }

        let count = 0;
        // static loot
        for (const i in statics)
        {
            const data = statics[i];

            if (data.Id in ids)
                continue;

            ids[data.Id] = true;

            LocationGenerator.generateContainerLoot(data.Items);
            output.Loot.push(data);
            count++;
        }
        Logger.success(`A total of ${count} containers generated`);

        // dyanmic loot
        const maxAttemptsAtPlacingLootAllowedCount = LocationConfig.limits[name];
        let placedLootCount = 0;

        // Loot position list for filtering the lootItem in the same position.
        const lootPositions = [];
        let failedAttemptsToPlaceLootCount = 0;
        let failedSpawnChanceCheck = 0;

        while ((failedAttemptsToPlaceLootCount + placedLootCount + failedSpawnChanceCheck) < maxAttemptsAtPlacingLootAllowedCount && dynamic.length > 0)
        {
            const result = LocationGenerator.generateDynamicLoot(dynamic, lootPositions, location);

            if (result.status === "success")
            {
                placedLootCount ++;
                lootPositions.push(result.position);
                output.Loot.push(result.data);
            }
            else if (result.status === "error")
            {
                if (result.reason === "duplicatelocation")
                {
                    failedAttemptsToPlaceLootCount++;
                }
                else if (result.reason === "failedspawnchancecheck")
                {
                    failedSpawnChanceCheck++;
                }
            }
        }

        // done generating
        Logger.success(`A total of ${placedLootCount} dynamic items spawned`);
        Logger.debug(`A total of ${failedSpawnChanceCheck} dynamic items failed the spawn check`);
        Logger.success(`Generated location ${name}`);
        return output;
    }

    /* get a location with generated loot data */
    static get(location)
    {
        const name = location.toLowerCase().replace(" ", "");
        return LocationController.generate(name);
    }

    /* get all locations without loot data */
    static generateAll()
    {
        const locations = DatabaseServer.tables.locations;
        const base = DatabaseServer.tables.locations.base;
        const data = {};

        // use right id's and strip loot
        for (const name in locations)
        {
            if (name === "base")
            {
                continue;
            }

            const map = locations[name].base;

            map.Loot = [];
            data[map._Id] = map;
        }

        base.locations = data;
        return base;
    }
}

module.exports = LocationController;

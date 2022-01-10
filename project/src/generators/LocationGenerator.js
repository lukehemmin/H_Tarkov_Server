"use strict";

require("../Lib.js");

class LocationGenerator
{
    static generateDynamicLoot(dynamic, lootPositions, location)
    {
        const rndLootIndex = RandomUtil.getInt(0, dynamic.length - 1);
        const rndLoot = dynamic[rndLootIndex];

        if (!rndLoot.data)
        {
            // remove item from array and return error
            dynamic.splice(rndLootIndex, 1);
            return { "result": "error", "reason": "baddata" };
        }

        const rndLootTypeIndex = RandomUtil.getInt(0, rndLoot.data.length - 1);
        const data = rndLoot.data[rndLootTypeIndex];

        //Check if LootItem is overlapping
        const position = `${data.Position.x},${data.Position.y},${data.Position.z}`;
        if (!LocationConfig.allowLootOverlay && lootPositions.includes(position))
        {
            //Clear selected loot
            dynamic[rndLootIndex].data.splice(rndLootTypeIndex, 1);

            if (dynamic[rndLootIndex].data.length === 0)
            {
                dynamic.splice(rndLootIndex, 1);
            }

            return { "status": "error", "reason": "duplicatelocation" };
        }

        //random loot Id
        data.Id = HashUtil.generate();

        //create lootItem list
        const lootItemsHash = {};
        const lootItemsByParentId = {};

        for (const i in data.Items)
        {
            // Check for the item spawnchance
            const loot = data.Items[i];
            lootItemsHash[loot._id] = loot;

            if (!("parentId" in loot))
                continue;

            if (lootItemsByParentId[loot.parentId] === undefined)
                lootItemsByParentId[loot.parentId] = [];
            lootItemsByParentId[loot.parentId].push(loot);
        }

        //reset itemId and childrenItemId
        for (const itemId of Object.keys(lootItemsHash))
        {
            const newId = HashUtil.generate();
            lootItemsHash[itemId]._id = newId;

            if (itemId === data.Root)
                data.Root = newId;

            if (lootItemsByParentId[itemId] === undefined)
                continue;

            for (const childrenItem of lootItemsByParentId[itemId])
            {
                childrenItem.parentId = newId;
            }
        }

        const globalLootChanceModifier = DatabaseServer.tables.globals.config.GlobalLootChanceModifier * 10;
        const locationLootChanceModifier = location.base.GlobalLootChanceModifier;
        const num = RandomUtil.getInt(0, 100);
        const spawnChance = DatabaseServer.tables.templates.items[data.Items[0]._tpl]._props.SpawnChance;
        const itemChance = Math.round(spawnChance * globalLootChanceModifier * locationLootChanceModifier);

        if (itemChance >= num)
        {
            return { "status": "success", "data": data, "position": position };
        }

        return { "status": "error", "reason": "failedspawnchancecheck" }; // item spawn chance was lower than random number
    }

    static generateContainerLoot(items)
    {
        const container = JsonUtil.clone(DatabaseServer.tables.loot.statics[items[0]._tpl]);
        const parentId = items[0]._id;
        const idPrefix = parentId.substring(0, parentId.length - 4);
        let idSuffix = parseInt(parentId.substring(parentId.length - 4), 16) + 1;
        let container2D = Array(container.height).fill(0).map(() => Array(container.width).fill(0));
        let minCount = container.minCount;


        // Spawn any forced items first
        for (let i = 1; i < items.length; i++)
        {
            const item = ItemHelper.getItem(items[i]._tpl)[1];

            container2D = ContainerHelper.fillContainerMapWithItem(
                container2D, items[i].location.x, items[i].location.y, item._props.Width, item._props.Height, items[i].location.r);
        }

        for (let i = minCount; i < container.maxCount; i++)
        {
            const roll = RandomUtil.getInt(0, 100);

            if (roll < container.chance)
            {
                minCount++;
            }
        }

        for (let i = 0; i < minCount; i++)
        {
            let item = {};
            let containerItem = {};
            let rolledIndex = 0;
            let result = { success: false };
            let maxAttempts = 20;
            const maxProbability = container.items[container.items.length - 1].cumulativeChance;

            while (!result.success && maxAttempts)
            {
                const roll = RandomUtil.getInt(0, maxProbability);
                rolledIndex = container.items.findIndex(itm => itm.cumulativeChance >= roll);
                const rolled = container.items[rolledIndex];
                item = JsonUtil.clone(ItemHelper.getItem(rolled.id)[1]);

                if (rolled.preset)
                {
                    // Guns will need to load a preset of items
                    item._props.presetId = rolled.preset.id;
                    item._props.Width = rolled.preset.w;
                    item._props.Height = rolled.preset.h;
                }

                result = ContainerHelper.findSlotForItem(container2D, item._props.Width, item._props.Height);
                maxAttempts--;
            }

            // if we weren't able to find an item to fit after 20 tries then container is probably full
            if (!result.success)
                break;

            container2D = ContainerHelper.fillContainerMapWithItem(
                container2D, result.x, result.y, item._props.Width, item._props.Height, result.rotation);
            const rot = result.rotation ? 1 : 0;

            if (item._props.presetId)
            {
                // Process gun preset into container items
                const preset = JsonUtil.clone(PresetController.getStandardPreset(item._id));
                preset._items[0].parentId = parentId;
                preset._items[0].slotId = "main";
                preset._items[0].location = { "x": result.x, "y": result.y, "r": rot };

                for (const p in preset._items)
                {
                    items.push(preset._items[p]);

                    if (preset._items[p].slotId === "mod_magazine")
                    {
                        const mag = ItemHelper.getItem(preset._items[p]._tpl)[1];
                        const cartridges = {
                            "_id": idPrefix + idSuffix.toString(16),
                            "_tpl": item._props.defAmmo,
                            "parentId": preset._items[p]._id,
                            "slotId": "cartridges",
                            "upd": { "StackObjectsCount": mag._props.Cartridges[0]._max_count }
                        };

                        items.push(cartridges);
                        idSuffix++;
                    }
                }

                // Don't spawn the same weapon more than once
                container.items.splice(rolledIndex, 1);
                continue;
            }

            containerItem = {
                "_id": idPrefix + idSuffix.toString(16),
                "_tpl": item._id,
                "parentId": parentId,
                "slotId": "main",
                "location": { "x": result.x, "y": result.y, "r": rot }
            };

            if (items.some(x => x._id === containerItem._id))
            {
                // Item ID collision detected, regenerating to random ID
                containerItem._id = HashUtil.generate();
            }

            if (item._parent !== "543be5dd4bdc2deb348b4569")
            {
                // Don't spawn the same item more than once (apart from money stacks)
                container.items.splice(rolledIndex, 1);
            }

            let cartridges;
            if (item._parent === "543be5dd4bdc2deb348b4569" || item._parent === "5485a8684bdc2da71d8b4567")
            {
                // Money or Ammo stack
                const stackCount = RandomUtil.getInt(item._props.StackMinRandom, item._props.StackMaxRandom);
                containerItem.upd = { "StackObjectsCount": stackCount };
            }
            else if (item._parent === "543be5cb4bdc2deb348b4568")
            {
                // Ammo container
                idSuffix++;

                cartridges = {
                    "_id": idPrefix + idSuffix.toString(16),
                    "_tpl": item._props.StackSlots[0]._props.filters[0].Filter[0],
                    "parentId": containerItem._id,
                    "slotId": "cartridges",
                    "upd": { "StackObjectsCount": item._props.StackMaxRandom }
                };
            }
            else if (item._parent === "5448bc234bdc2d3c308b4569")
            {
                // Magazine
                idSuffix++;
                cartridges = {
                    "_id": idPrefix + idSuffix.toString(16),
                    "_tpl": this.getRandomCompatibleCaliberTemplateId(item),
                    "parentId": containerItem._id,
                    "slotId": "cartridges",
                    "upd": { "StackObjectsCount": item._props.Cartridges[0]._max_count }
                };
            }

            items.push(containerItem);
            if (cartridges)
            {
                items.push(cartridges);
            }
            idSuffix++;
        }
    }

    static getRandomCompatibleCaliberTemplateId(item)
    {
        return item._props.Cartridges[0]._props.filters[0].Filter[Math.floor(Math.random() * item._props.Cartridges[0]._props.filters[0].Filter.length)];
    }
}

module.exports = LocationGenerator;
"use strict";

require("../Lib.js");

const EquipmentSlots = {
    Headwear: "Headwear",
    Earpiece: "Earpiece",
    FaceCover: "FaceCover",
    ArmorVest: "ArmorVest",
    Eyewear: "Eyewear",
    ArmBand: "ArmBand",
    TacticalVest: "TacticalVest",
    Pockets: "Pockets",
    Backpack: "Backpack",
    SecuredContainer: "SecuredContainer",
    FirstPrimaryWeapon: "FirstPrimaryWeapon",
    SecondPrimaryWeapon: "SecondPrimaryWeapon",
    Holster: "Holster",
    Scabbard: "Scabbard"
};

class BotGenerator
{
    static inventory = {};

    static generateInventory(templateInventory, equipmentChances, generation)
    {
        // Generate base inventory with no items
        BotGenerator.inventory = BotGenerator.generateInventoryBase();

        // Go over all defined equipment slots and generate an item for each of them
        const excludedSlots = [
            EquipmentSlots.FirstPrimaryWeapon,
            EquipmentSlots.SecondPrimaryWeapon,
            EquipmentSlots.Holster,
            EquipmentSlots.ArmorVest
        ];

        for (const equipmentSlot in templateInventory.equipment)
        {
            // Weapons have special generation and will be generated seperately; ArmorVest should be generated after TactivalVest
            if (excludedSlots.includes(equipmentSlot))
            {
                continue;
            }
            BotGenerator.generateEquipment(equipmentSlot, templateInventory.equipment[equipmentSlot], templateInventory.mods, equipmentChances);
        }

        // ArmorVest is generated afterwards to ensure that TacticalVest is always first, in case it is incompatible
        BotGenerator.generateEquipment(EquipmentSlots.ArmorVest, templateInventory.equipment.ArmorVest, templateInventory.mods, equipmentChances);

        // Roll weapon spawns and generate a weapon for each roll that passed
        const shouldSpawnPrimary = RandomUtil.getIntEx(100) <= equipmentChances.equipment.FirstPrimaryWeapon;
        const weaponSpawns = [
            {
                slot: EquipmentSlots.FirstPrimaryWeapon,
                shouldSpawn: shouldSpawnPrimary
            },
            { // Only roll for a chance at secondary if primary roll was successful
                slot: EquipmentSlots.SecondPrimaryWeapon,
                shouldSpawn: shouldSpawnPrimary ? RandomUtil.getIntEx(100) <= equipmentChances.equipment.SecondPrimaryWeapon : false
            },
            { // Roll for an extra pistol, unless primary roll failed - in that case, pistol is guaranteed
                slot: EquipmentSlots.Holster,
                shouldSpawn: shouldSpawnPrimary ? RandomUtil.getIntEx(100) <= equipmentChances.equipment.Holster : true
            }
        ];

        for (const weaponSpawn of weaponSpawns)
        {
            if (weaponSpawn.shouldSpawn && templateInventory.equipment[weaponSpawn.slot].length)
            {
                BotGenerator.generateWeapon(
                    weaponSpawn.slot,
                    templateInventory.equipment[weaponSpawn.slot],
                    templateInventory.mods,
                    equipmentChances.mods,
                    generation.items.magazines);
            }
        }

        BotGenerator.generateLoot(templateInventory.items, generation.items);

        return JsonUtil.clone(BotGenerator.inventory);
    }

    static generateInventoryBase()
    {
        const equipmentId = HashUtil.generate();
        const equipmentTpl = "55d7217a4bdc2d86028b456d";

        const stashId = HashUtil.generate();
        const stashTpl = "566abbc34bdc2d92178b4576";

        const questRaidItemsId = HashUtil.generate();
        const questRaidItemsTpl = "5963866286f7747bf429b572";

        const questStashItemsId = HashUtil.generate();
        const questStashItemsTpl = "5963866b86f7747bfa1c4462";

        const sortingTableId = HashUtil.generate();
        const sortingTableTpl = "602543c13fee350cd564d032";

        return {
            "items": [
                {
                    "_id": equipmentId,
                    "_tpl": equipmentTpl
                },
                {
                    "_id": stashId,
                    "_tpl": stashTpl
                },
                {
                    "_id": questRaidItemsId,
                    "_tpl": questRaidItemsTpl
                },
                {
                    "_id": questStashItemsId,
                    "_tpl": questStashItemsTpl
                },
                {
                    "_id": sortingTableId,
                    "_tpl": sortingTableTpl
                }
            ],
            "equipment": equipmentId,
            "stash": stashId,
            "questRaidItems": questRaidItemsId,
            "questStashItems": questStashItemsId,
            "sortingTable": sortingTableId,
            "fastPanel": {}
        };
    }

    static generateEquipment(equipmentSlot, equipmentPool, modPool, spawnChances)
    {
        const spawnChance = [EquipmentSlots.Pockets, EquipmentSlots.SecuredContainer].includes(equipmentSlot)
            ? 100
            : spawnChances.equipment[equipmentSlot];
        if (typeof spawnChance === "undefined")
        {
            Logger.warning(`No spawn chance was defined for ${equipmentSlot}`);
            return;
        }

        const shouldSpawn = RandomUtil.getIntEx(100) <= spawnChance;
        if (equipmentPool.length && shouldSpawn)
        {
            const id = HashUtil.generate();
            const tpl = RandomUtil.getArrayValue(equipmentPool);
            const itemTemplate = DatabaseServer.tables.templates.items[tpl];

            if (!itemTemplate)
            {
                Logger.error(`Could not find item template with tpl ${tpl}`);
                Logger.info(`EquipmentSlot -> ${equipmentSlot}`);
                return;
            }

            if (BotGenerator.isItemIncompatibleWithCurrentItems(BotGenerator.inventory.items, tpl, equipmentSlot))
            {
                // Bad luck - randomly picked item was not compatible with current gear
                return;
            }

            const item = {
                "_id": id,
                "_tpl": tpl,
                "parentId": BotGenerator.inventory.equipment,
                "slotId": equipmentSlot,
                ...BotGenerator.generateExtraPropertiesForItem(itemTemplate)
            };

            if (Object.keys(modPool).includes(tpl))
            {
                const items = BotGenerator.generateModsForItem([item], modPool, id, itemTemplate, spawnChances.mods);
                BotGenerator.inventory.items.push(...items);
            }
            else
            {
                BotGenerator.inventory.items.push(item);
            }
        }
    }

    static generateWeapon(equipmentSlot, weaponPool, modPool, modChances, magCounts)
    {
        const id = HashUtil.generate();
        const tpl = RandomUtil.getArrayValue(weaponPool);
        const itemTemplate = DatabaseServer.tables.templates.items[tpl];

        if (!itemTemplate)
        {
            Logger.error(`Could not find item template with tpl ${tpl}`);
            Logger.error(`WeaponSlot -> ${equipmentSlot}`);
            return;
        }

        let weaponMods = [{
            "_id": id,
            "_tpl": tpl,
            "parentId": BotGenerator.inventory.equipment,
            "slotId": equipmentSlot,
            ...BotGenerator.generateExtraPropertiesForItem(itemTemplate)
        }];

        if (Object.keys(modPool).includes(tpl))
        {
            weaponMods = BotGenerator.generateModsForItem(weaponMods, modPool, id, itemTemplate, modChances);
        }

        if (!BotGenerator.isWeaponValid(weaponMods))
        {
            // Invalid weapon generated, fallback to preset
            Logger.warning(`Weapon ${tpl} was generated incorrectly, see error above`);
            weaponMods = [];

            // TODO: Right now, preset weapons trigger a lot of warnings regarding missing ammo in magazines & such
            let preset;
            for (const [presetId, presetObj] of Object.entries(DatabaseServer.tables.globals.ItemPresets))
            {
                if (presetObj._items[0]._tpl === tpl)
                {
                    preset = presetObj;
                    break;
                }
            }

            if (preset)
            {
                const parentItem = preset._items[0];
                preset._items[0] = {
                    ...parentItem, ...{
                        "parentId": BotGenerator.inventory.equipment,
                        "slotId": equipmentSlot,
                        ...BotGenerator.generateExtraPropertiesForItem(itemTemplate)
                    }
                };
                weaponMods.push(...preset._items);
            }
            else
            {
                Logger.error(`Could not find preset for weapon with tpl ${tpl}`);
                return;
            }
        }

        // Find ammo to use when filling magazines
        const ammoTpl = BotGenerator.getCompatibleAmmo(weaponMods, itemTemplate);

        // Fill existing magazines to full and sync ammo type
        for (const mod of weaponMods.filter(mod => mod.slotId === "mod_magazine"))
        {
            BotGenerator.fillExistingMagazines(weaponMods, mod, ammoTpl);
        }

        BotGenerator.inventory.items.push(...weaponMods);

        // Generate extra magazines and attempt add them to TacticalVest or Pockets
        BotGenerator.generateExtraMagazines(weaponMods, itemTemplate, magCounts, ammoTpl);
    }

    static generateModsForItem(items, modPool, parentId, parentTemplate, modSpawnChances)
    {
        const itemModPool = modPool[parentTemplate._id];

        if (!parentTemplate._props.Slots.length
            && !parentTemplate._props.Cartridges.length
            && !parentTemplate._props.Chambers.length)
        {
            Logger.error(`Item ${parentTemplate._id} had mods defined, but no slots to support them`);
            return items;
        }

        for (const modSlot in itemModPool)
        {
            let itemSlot;
            switch (modSlot)
            {
                case "patron_in_weapon":
                case "patron_in_weapon_000":
                case "patron_in_weapon_001":
                    itemSlot = parentTemplate._props.Chambers.find(c => c._name.includes(modSlot));

                    // Check for magazine in case its the revolver shotgun
                    if (!itemSlot)
                    {
                        itemSlot = parentTemplate._props.Slots.find(c => c._name === "mod_magazine");
                    }
                    break;
                case "cartridges":
                    itemSlot = parentTemplate._props.Cartridges.find(c => c._name === modSlot);
                    break;
                default:
                    itemSlot = parentTemplate._props.Slots.find(s => s._name === modSlot);
                    break;
            }

            if (!itemSlot)
            {
                Logger.error(`Slot '${modSlot}' does not exist for item ${parentTemplate._id}`);
                continue;
            }

            const modSpawnChance = itemSlot._required || ["mod_magazine", "patron_in_weapon", "patron_in_weapon_000", "patron_in_weapon_001", "cartridges"].includes(modSlot)
                ? 100
                : modSpawnChances[modSlot];
            if (RandomUtil.getIntEx(100) > modSpawnChance)
            {
                continue;
            }

            const exhaustableModPool = new ExhaustableArray(itemModPool[modSlot]);

            let modTpl;
            let found = false;
            while (exhaustableModPool.hasValues())
            {
                modTpl = exhaustableModPool.getRandomValue();
                if (!BotGenerator.isItemIncompatibleWithCurrentItems(items, modTpl, modSlot))
                {
                    found = true;
                    break;
                }
            }

            // Find a mod to attach from items db for required slots if none found above
            const parentSlot = parentTemplate._props.Slots.find(i => i._name === modSlot);
            if (!found && parentSlot !== undefined && parentSlot._required)
            {
                modTpl = BotGenerator.getModTplFromItemDb(modTpl, parentSlot, modSlot, items);
                found = !!modTpl;
            }

            if (!found || !modTpl)
            {
                if (itemSlot._required)
                {
                    Logger.error(`Could not locate any compatible items to fill '${modSlot}' for ${parentTemplate._id}`);
                }
                continue;
            }

            if (!itemSlot._props.filters[0].Filter.includes(modTpl))
            {
                Logger.error(`Mod ${modTpl} is not compatible with slot '${modSlot}' for item ${parentTemplate._id}`);
                continue;
            }

            const modTemplate = DatabaseServer.tables.templates.items[modTpl];
            if (!modTemplate)
            {
                Logger.error(`Could not find mod item template with tpl ${modTpl}`);
                Logger.info(`Item -> ${parentTemplate._id}; Slot -> ${modSlot}`);
                continue;
            }

            const modId = HashUtil.generate();
            items.push({
                "_id": modId,
                "_tpl": modTpl,
                "parentId": parentId,
                "slotId": modSlot,
                ...BotGenerator.generateExtraPropertiesForItem(modTemplate)
            });

            if (Object.keys(modPool).includes(modTpl))
            {
                BotGenerator.generateModsForItem(items, modPool, modId, modTemplate, modSpawnChances);
            }
        }

        return items;
    }

    static getModTplFromItemDb(modTpl, parentSlot, modSlot, items)
    {
        // Find combatible mods and make an array of them
        const unsortedModArray = parentSlot._props.filters[0].Filter;

        // Sort by spawn chance, highest to lowest, higher is more common
        const sortedModArray = unsortedModArray.sort((a, b) =>
        {
            a = DatabaseServer.tables.templates.items[a]._props.SpawnChance;
            b = DatabaseServer.tables.templates.items[b]._props.SpawnChance;

            return a - b;
        });

        // Find mod item that fits slot from sorted mod array
        const exhaustableModPool = new ExhaustableArray(sortedModArray);
        while (exhaustableModPool.hasValues())
        {
            modTpl = exhaustableModPool.getFirstValue();
            if (!BotGenerator.isItemIncompatibleWithCurrentItems(items, modTpl, modSlot))
            {
                return modTpl;
            }
        }
        return null;
    }

    static generateExtraPropertiesForItem(itemTemplate)
    {
        const properties = {};

        if (itemTemplate._props.MaxDurability)
        {
            properties.Repairable = { "Durability": itemTemplate._props.MaxDurability };
        }

        if (itemTemplate._props.HasHinge)
        {
            properties.Togglable = { "On": true };
        }

        if (itemTemplate._props.Foldable)
        {
            properties.Foldable = { "Folded": false };
        }

        if (itemTemplate._props.weapFireType && itemTemplate._props.weapFireType.length)
        {
            properties.FireMode = { "FireMode": itemTemplate._props.weapFireType[0] };
        }

        if (itemTemplate._props.MaxHpResource)
        {
            properties.MedKit = { "HpResource": itemTemplate._props.MaxHpResource };
        }

        if (itemTemplate._props.MaxResource && itemTemplate._props.foodUseTime)
        {
            properties.FoodDrink = { "HpPercent": itemTemplate._props.MaxResource };
        }

        return Object.keys(properties).length ? { "upd": properties } : {};
    }

    static isItemIncompatibleWithCurrentItems(items, tplToCheck, equipmentSlot)
    {
        // TODO: Can probably be optimized to cache itemTemplates as items are added to inventory
        const itemTemplates = items.map(i => DatabaseServer.tables.templates.items[i._tpl]);
        const templateToCheck = DatabaseServer.tables.templates.items[tplToCheck];

        // Check if any of the current inventory templates have the incoming item defined as incompatible
        const currentInventoryCheck = itemTemplates.some(item => item._props[`Blocks${equipmentSlot}`] || item._props.ConflictingItems.includes(tplToCheck));
        // Check if the incoming item has any inventory items defined as incompatible
        const itemCheck = items.some(item => templateToCheck._props[`Blocks${item.slotId}`] || templateToCheck._props.ConflictingItems.includes(item._tpl));

        return currentInventoryCheck || itemCheck;
    }

    /** Checks if all required slots are occupied on a weapon and all it's mods */
    static isWeaponValid(itemList)
    {
        for (const item of itemList)
        {
            const template = DatabaseServer.tables.templates.items[item._tpl];
            if (!template._props.Slots || !template._props.Slots.length)
            {
                continue;
            }

            for (const slot of template._props.Slots)
            {
                if (!slot._required)
                {
                    continue;
                }

                const slotItem = itemList.find(i => i.parentId === item._id && i.slotId === slot._name);
                if (!slotItem)
                {
                    Logger.error(`Required slot '${slot._name}' on ${template._id} was empty`);
                    return false;
                }
            }
        }

        return true;
    }

    /**
    * Generates extra magazines or bullets (if magazine is internal) and adds them to TacticalVest and Pockets.
    * Additionally, adds extra bullets to SecuredContainer
    *
    * @param {*} weaponMods
    * @param {*} weaponTemplate
    * @param {*} magCounts
    * @param {*} ammoTpl
    * @returns
    */
    static generateExtraMagazines(weaponMods, weaponTemplate, magCounts, ammoTpl)
    {
        let magazineTpl = "";
        const magazine = weaponMods.find(m => m.slotId === "mod_magazine");
        if (!magazine)
        {
            // log error if no magazine AND not a chamber loaded weapon (e.g. shotgun revolver)
            if (!weaponTemplate._props.isChamberLoad)
            {
                Logger.warning(`Generated weapon with tpl ${weaponTemplate._id} had no magazine`);
            }

            magazineTpl = weaponTemplate._props.defMagType;
        }
        else
        {
            magazineTpl = magazine._tpl;
        }

        let magTemplate = DatabaseServer.tables.templates.items[magazineTpl];
        if (!magTemplate)
        {
            Logger.error(`Could not find magazine template with tpl ${magazineTpl}`);
            return;
        }

        const range = magCounts.max - magCounts.min;
        const count = BotGenerator.getBiasedRandomNumber(magCounts.min, magCounts.max, Math.round(range * 0.75), 4);

        if (magTemplate._props.ReloadMagType === "InternalMagazine")
        {
            /* Get the amount of bullets that would fit in the internal magazine
             * and multiply by how many magazines were supposed to be created */
            const bulletCount = magTemplate._props.Cartridges[0]._max_count * count;

            BotGenerator.addBullets(ammoTpl, bulletCount);
        }
        else if (weaponTemplate._props.ReloadMode === "OnlyBarrel")
        {
            const bulletCount = count;

            BotGenerator.addBullets(ammoTpl, bulletCount);
        }
        else
        {
            for (let i = 0; i < count; i++)
            {
                const magId = HashUtil.generate();
                const magWithAmmo = [
                    {
                        "_id": magId,
                        "_tpl": magazineTpl
                    },
                    {
                        "_id": HashUtil.generate(),
                        "_tpl": ammoTpl,
                        "parentId": magId,
                        "slotId": "cartridges",
                        "upd": { "StackObjectsCount": magTemplate._props.Cartridges[0]._max_count }
                    }
                ];

                const success = BotGenerator.addItemWithChildrenToEquipmentSlot(
                    [EquipmentSlots.TacticalVest, EquipmentSlots.Pockets],
                    magId,
                    magazineTpl,
                    magWithAmmo);

                if (!success && i < magCounts.min)
                {
                    /* We were unable to fit at least the minimum amount of magazines,
                     * so we fallback to default magazine and try again.
                     * Temporary workaround to Killa spawning with no extras if he spawns with a drum mag */

                    if (magazineTpl === weaponTemplate._props.defMagType)
                    {
                        // We were already on default - stop here to prevent infinite looping
                        break;
                    }

                    magazineTpl = weaponTemplate._props.defMagType;
                    magTemplate = DatabaseServer.tables.templates.items[magazineTpl];
                    if (!magTemplate)
                    {
                        Logger.error(`Could not find magazine template with tpl ${magazineTpl}`);
                        break;
                    }

                    if (magTemplate._props.ReloadMagType === "InternalMagazine")
                    {
                        break;
                    }

                    i--;
                }
            }
        }

        const ammoTemplate = DatabaseServer.tables.templates.items[ammoTpl];
        if (!ammoTemplate)
        {
            Logger.error(`Could not find ammo template with tpl ${ammoTpl}`);
            return;
        }

        // Add 4 stacks of bullets to SecuredContainer
        for (let i = 0; i < 4; i++)
        {
            const id = HashUtil.generate();
            BotGenerator.addItemWithChildrenToEquipmentSlot([EquipmentSlots.SecuredContainer], id, ammoTpl, [{
                "_id": id,
                "_tpl": ammoTpl,
                "upd": { "StackObjectsCount": ammoTemplate._props.StackMaxSize }
            }]);
        }
    }

    static addBullets(ammoTpl, bulletCount)
    {
        const ammoItems = ItemHelper.splitStack({
            "_id": HashUtil.generate(),
            "_tpl": ammoTpl,
            "upd": { "StackObjectsCount": bulletCount }
        });

        for (const ammoItem of ammoItems)
        {
            BotGenerator.addItemWithChildrenToEquipmentSlot(
                [EquipmentSlots.TacticalVest, EquipmentSlots.Pockets],
                ammoItem._id,
                ammoItem._tpl,
                [ammoItem]);
        }
    }

    /**
     * Finds and returns tpl of ammo that should be used, while making sure it's compatible
     *
     * @param {*} weaponMods
     * @param {*} weaponTemplate
     * @returns
     */
    static getCompatibleAmmo(weaponMods, weaponTemplate)
    {
        let ammoTpl = "";
        let ammoToUse = weaponMods.find(mod => mod.slotId === "patron_in_weapon");
        if (!ammoToUse)
        {
            // No bullet found in chamber, search for ammo in magazines instead
            ammoToUse = weaponMods.find(mod => mod.slotId === "cartridges");
            if (!ammoToUse)
            {
                // Still could not locate ammo to use? Fallback to weapon default
                Logger.warning(`Could not locate ammo to use for ${weaponTemplate._id}, falling back to default -> ${weaponTemplate._props.defAmmo}`);
                // Immediatelly returns, as default ammo is guaranteed to be compatible
                return weaponTemplate._props.defAmmo;
            }
            else
            {
                ammoTpl = ammoToUse._tpl;
            }
        }
        else
        {
            ammoTpl = ammoToUse._tpl;
        }

        if (weaponTemplate._props.Chambers[0] && !weaponTemplate._props.Chambers[0]._props.filters[0].Filter.includes(ammoToUse._tpl))
        {
            // Incompatible ammo was found, return default (can happen with .366 and 7.62x39 weapons)
            return weaponTemplate._props.defAmmo;
        }

        return ammoTpl;
    }

    /** Fill existing magazines to full, while replacing their contents with specified ammo */
    static fillExistingMagazines(weaponMods, magazine, ammoTpl)
    {
        const modTemplate = DatabaseServer.tables.templates.items[magazine._tpl];
        if (!modTemplate)
        {
            Logger.error(`Could not find magazine template with tpl ${magazine._tpl}`);
            return;
        }

        const stackSize = modTemplate._props.Cartridges[0]._max_count;
        const cartridges = weaponMods.find(m => m.parentId === magazine._id && m.slotId === "cartridges");

        if (!cartridges)
        {
            Logger.warning(`Magazine with tpl ${magazine._tpl} had no ammo`);
            weaponMods.push({
                "_id": HashUtil.generate(),
                "_tpl": ammoTpl,
                "parentId": magazine._id,
                "slotId": "cartridges",
                "upd": { "StackObjectsCount": stackSize }
            });
        }
        else
        {
            cartridges._tpl = ammoTpl;
            cartridges.upd = { "StackObjectsCount": stackSize };
        }
    }

    static generateLoot(lootPool, itemCounts)
    {
        // Flatten all individual slot loot pools into one big pool, while filtering out potentially missing templates
        const lootTemplates = [];
        const specialLootTemplates = [];

        for (const [slot, pool] of Object.entries(lootPool))
        {
            if (!pool || !pool.length)
            {
                continue;
            }

            if (slot === "SpecialLoot")
            {
                const poolSpecialItems = pool.map(lootTpl => DatabaseServer.tables.templates.items[lootTpl]);
                specialLootTemplates.push(...poolSpecialItems.filter(x => !!x));
            }
            else
            {
                const poolItems = pool.map(lootTpl => DatabaseServer.tables.templates.items[lootTpl]);
                lootTemplates.push(...poolItems.filter(x => !!x));
            }
        }

        // Sort all items by their worth to spawn chance ratio
        lootTemplates.sort((a, b) => BotGenerator.compareByValue(a, b));
        specialLootTemplates.sort((a, b) => BotGenerator.compareByValue(a, b));

        //// Get all special items
        const specialLootItems = specialLootTemplates.filter(template =>
            !("ammoType" in template._props)
            && !("ReloadMagType" in template._props));

        // Get all healing items
        const healingItems = lootTemplates.filter(template => "medUseTime" in template._props);

        // Get all grenades
        const grenadeItems = lootTemplates.filter(template => "ThrowType" in template._props);

        // Get all misc loot items (excluding magazines, bullets, grenades and healing items)
        const lootItems = lootTemplates.filter(template =>
            !("ammoType" in template._props)
            && !("ReloadMagType" in template._props)
            && !("medUseTime" in template._props)
            && !("ThrowType" in template._props));

        let range = itemCounts.healing.max - itemCounts.healing.min;
        const healingItemCount = BotGenerator.getBiasedRandomNumber(itemCounts.healing.min, itemCounts.healing.max, range, 3);

        range = itemCounts.looseLoot.max - itemCounts.looseLoot.min;
        const lootItemCount = BotGenerator.getBiasedRandomNumber(itemCounts.looseLoot.min, itemCounts.looseLoot.max, range, 5);

        range = itemCounts.specialItems.max - itemCounts.specialItems.min;
        const specialLootItemCount = BotGenerator.getBiasedRandomNumber(itemCounts.specialItems.min, itemCounts.specialItems.max, range, 6);

        range = itemCounts.grenades.max - itemCounts.grenades.min;
        const grenadeCount = BotGenerator.getBiasedRandomNumber(itemCounts.grenades.min, itemCounts.grenades.max, range, 4);

        BotGenerator.addLootFromPool(specialLootItems, [EquipmentSlots.Pockets, EquipmentSlots.Backpack, EquipmentSlots.TacticalVest], specialLootItemCount);
        BotGenerator.addLootFromPool(lootItems, [EquipmentSlots.Backpack, EquipmentSlots.Pockets, EquipmentSlots.TacticalVest], lootItemCount);
        BotGenerator.addLootFromPool(healingItems, [EquipmentSlots.TacticalVest, EquipmentSlots.Pockets, EquipmentSlots.Backpack, EquipmentSlots.SecuredContainer], healingItemCount);
        BotGenerator.addLootFromPool(grenadeItems, [EquipmentSlots.TacticalVest, EquipmentSlots.Pockets], grenadeCount);
    }

    static addLootFromPool(pool, equipmentSlots, count)
    {
        if (pool.length)
        {
            for (let i = 0; i < count; i++)
            {
                const itemIndex = BotGenerator.getBiasedRandomNumber(0, pool.length - 1, pool.length - 1, 3);
                const itemTemplate = pool[itemIndex];
                const id = HashUtil.generate();
                const itemsToAdd = [{
                    "_id": id,
                    "_tpl": itemTemplate._id,
                    ...BotGenerator.generateExtraPropertiesForItem(itemTemplate)
                }];

                // Fill ammo box
                if (itemTemplate._props.StackSlots && itemTemplate._props.StackSlots.length)
                {
                    itemsToAdd.push({
                        "_id": HashUtil.generate(),
                        "_tpl": itemTemplate._props.StackSlots[0]._props.filters[0].Filter[0],
                        "parentId": id,
                        "slotId": "cartridges",
                        "upd": { "StackObjectsCount": itemTemplate._props.StackMaxRandom }
                    });
                }

                BotGenerator.addItemWithChildrenToEquipmentSlot(equipmentSlots, id, itemTemplate._id, itemsToAdd);
            }
        }
    }

    /** Adds an item with all its childern into specified equipmentSlots, wherever it fits.
     * Returns a `boolean` indicating success. */
    static addItemWithChildrenToEquipmentSlot(equipmentSlots, parentId, parentTpl, itemWithChildren)
    {
        for (const slot of equipmentSlots)
        {
            const container = BotGenerator.inventory.items.find(i => i.slotId === slot);

            if (!container)
            {
                continue;
            }

            const containerTemplate = DatabaseServer.tables.templates.items[container._tpl];

            if (!containerTemplate)
            {
                Logger.error(`Could not find container template with tpl ${container._tpl}`);
                continue;
            }

            if (!containerTemplate._props.Grids || !containerTemplate._props.Grids.length)
            {
                // Container has no slots to hold items
                continue;
            }

            const itemSize = InventoryHelper.getItemSize(parentTpl, parentId, itemWithChildren);

            for (const slot of containerTemplate._props.Grids)
            {
                if (slot._props.cellsH === 0 || slot._props.cellsV === 0)
                {
                    continue;
                }

                const containerItems = BotGenerator.inventory.items.filter(i => i.parentId === container._id && i.slotId === slot._name);
                const slotMap = ContainerHelper.getContainerMap(slot._props.cellsH, slot._props.cellsV, containerItems, container._id);
                const findSlotResult = ContainerHelper.findSlotForItem(slotMap, itemSize[0], itemSize[1]);

                if (findSlotResult.success)
                {
                    const parentItem = itemWithChildren.find(i => i._id === parentId);

                    parentItem.parentId = container._id;
                    parentItem.slotId = slot._name;
                    parentItem.location = {
                        "x": findSlotResult.x,
                        "y": findSlotResult.y,
                        "r": findSlotResult.rotation ? 1 : 0
                    };

                    BotGenerator.inventory.items.push(...itemWithChildren);
                    return true;
                }
            }
        }

        return false;
    }

    static getBiasedRandomNumber(min, max, shift, n)
    {
        /* To whoever tries to make sense of this, please forgive me - I tried my best at explaining what goes on here.
         * This function generates a random number based on a gaussian distribution with an option to add a bias via shifting.
         *
         * Here's an example graph of how the probabilities can be distributed:
         * https://www.boost.org/doc/libs/1_49_0/libs/math/doc/sf_and_dist/graphs/normal_pdf.png
         * Our parameter 'n' is sort of like σ (sigma) in the example graph.
         *
         * An 'n' of 1 means all values are equally likely. Increasing 'n' causes numbers near the edge to become less likely.
         * By setting 'shift' to whatever 'max' is, we can make values near 'min' very likely, while values near 'max' become extremely unlikely.
         *
         * Here's a place where you can play around with the 'n' and 'shift' values to see how the distribution changes:
         * http://jsfiddle.net/e08cumyx/ */

        if (max < min)
        {
            throw {
                "name": "Invalid arguments",
                "message": `Bounded random number generation max is smaller than min (${max} < ${min})`
            };
        }

        if (n < 1)
        {
            throw {
                "name": "Invalid argument",
                "message": `'n' must be 1 or greater (received ${n})`
            };
        }

        if (min === max)
        {
            return min;
        }

        if (shift > (max - min))
        {
            /* If a rolled number is out of bounds (due to bias being applied), we simply roll it again.
             * As the shifting increases, the chance of rolling a number within bounds decreases.
             * A shift that is equal to the available range only has a 50% chance of rolling correctly, theoretically halving performance.
             * Shifting even further drops the success chance very rapidly - so we want to warn against that */

            Logger.warning("Bias shift for random number generation is greater than the range of available numbers.\nThis can have a very severe performance impact!");
            Logger.info(`min -> ${min}; max -> ${max}; shift -> ${shift}`);
        }

        const gaussianRandom = (n) =>
        {
            let rand = 0;

            for (let i = 0; i < n; i += 1)
            {
                rand += Math.random();
            }

            return (rand / n);
        };

        const boundedGaussian = (start, end, n) =>
        {
            return Math.round(start + gaussianRandom(n) * (end - start + 1));
        };

        const biasedMin = shift >= 0 ? min - shift : min;
        const biasedMax = shift < 0 ? max + shift : max;

        let num;
        do
        {
            num = boundedGaussian(biasedMin, biasedMax, n);
        }
        while (num < min || num > max);

        return num;
    }

    /** Compares two item templates by their price to spawn chance ratio */
    static compareByValue(a, b)
    {
        // If an item has no price or spawn chance, it should be moved to the back when sorting
        if (!a._props.CreditsPrice || !a._props.SpawnChance)
        {
            return 1;
        }

        if (!b._props.CreditsPrice || !b._props.SpawnChance)
        {
            return -1;
        }

        const worthA = a._props.CreditsPrice / a._props.SpawnChance;
        const worthB = b._props.CreditsPrice / b._props.SpawnChance;

        if (worthA < worthB)
        {
            return -1;
        }

        if (worthA > worthB)
        {
            return 1;
        }

        return 0;
    }
}

class ExhaustableArray
{
    constructor(itemPool)
    {
        this.pool = JsonUtil.clone(itemPool);
    }

    getRandomValue()
    {
        if (!this.pool || !this.pool.length)
        {
            return null;
        }

        const index = RandomUtil.getInt(0, this.pool.length - 1);
        const toReturn = JsonUtil.clone(this.pool[index]);
        this.pool.splice(index, 1);
        return toReturn;
    }

    getFirstValue()
    {
        if (!this.pool || !this.pool.length)
        {
            return null;
        }

        const toReturn = JsonUtil.clone(this.pool[0]);
        this.pool.splice(0, 1);
        return toReturn;
    }

    hasValues()
    {
        if (this.pool && this.pool.length)
        {
            return true;
        }

        return false;
    }
}

module.exports = BotGenerator;

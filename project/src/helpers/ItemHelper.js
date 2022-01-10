"use strict";

require("../Lib.js");

class ItemHelper
{
    static get BASECLASS()
    {
        return {
            "Weapon": "5422acb9af1c889c16000029",
            "Armor": "5448e54d4bdc2dcc718b4568",
            "Vest": "5448e5284bdc2dcb718b4567",
            "Backpack": "5448e53e4bdc2d60728b4567",
            "Visors": "5448e5724bdc2ddf718b4568",
            "Food": "5448e8d04bdc2ddf718b4569",
            "Drink": "5448e8d64bdc2dce718b4568",
            "BarterItem": "5448eb774bdc2d0a728b4567",
            "Info": "5448ecbe4bdc2d60728b4568",
            "MedKit": "5448f39d4bdc2d0a728b4568",
            "Drugs": "5448f3a14bdc2d27728b4569",
            "Stimulator": "5448f3a64bdc2d60728b456a",
            "Medical": "5448f3ac4bdc2dce718b4569",
            "Mod": "5448fe124bdc2da5018b4567",
            "Muzzle": "5448fe394bdc2d0d028b456c",
            "Sights": "5448fe7a4bdc2d6f028b456b",
            "Meds": "543be5664bdc2dd4348b4569",
            "Money": "543be5dd4bdc2deb348b4569",
            "Key": "543be5e94bdc2df1348b4568",
            "Equipment": "543be5f84bdc2dd4348b456a",
            "ThrowWeap": "543be6564bdc2df4348b4568",
            "FoodDrink": "543be6674bdc2df1348b4569",
            "Pistol": "5447b5cf4bdc2d65278b4567",
            "Smg": "5447b5e04bdc2d62278b4567",
            "AssaultRifle": "5447b5f14bdc2d61278b4567",
            "AssaultCarbine": "5447b5fc4bdc2d87278b4567",
            "Shotgun": "5447b6094bdc2dc3278b4567",
            "MarksmanRifle": "5447b6194bdc2d67278b4567",
            "SniperRifle": "5447b6254bdc2dc3278b4568",
            "MachineGun": "5447bed64bdc2d97278b4568",
            "GrenadeLauncher": "5447bedf4bdc2d87278b4568",
            "SpecialWeapon": "5447bee84bdc2dc3278b4569",
            "SpecItem": "5447e0e74bdc2d3c308b4567",
            "Knife": "5447e1d04bdc2dff2f8b4567",
            "Ammo": "5485a8684bdc2da71d8b4567",
            "AmmoBox": "543be5cb4bdc2deb348b4568",
            "LootContainer": "566965d44bdc2d814c8b4571",
            "MobContainer": "5448bf274bdc2dfc2f8b456a",
            "SearchableItem": "566168634bdc2d144c8b456c",
            "Stash": "566abbb64bdc2d144c8b457d",
            "SortingTable": "6050cac987d3f925bf016837",
            "LockableContainer": "5671435f4bdc2d96058b4569",
            "SimpleContainer": "5795f317245977243854e041",
            "Inventory": "55d720f24bdc2d88028b456d",
            "StationaryContainer": "567583764bdc2d98058b456e",
            "Pockets": "557596e64bdc2dc2118b4571",
            "Armband": "5b3f15d486f77432d0509248"
        };
    }

    static get MONEY()
    {
        return {
            "Roubles": "5449016a4bdc2d6f028b456f",
            "Euros": "569668774bdc2da2298b4568",
            "Dollars": "5696686a4bdc2da3298b456a"
        };
    }

    /**
     * Picks rewardable items from items.json. This means they need to fit into the inventory and they shouldn't be keys (debatable)
     * @returns     a list of rewardable items [[_id, item_object],...]
     */
    static getRewardableItems()
    {
        // check for specific baseclasses which don't make sense as reward item
        // also check if the price is greater than 0; there are some items whose price can not be found
        // those are not in the game yet (e.g. AGS grenade launcher)
        return Object.entries(DatabaseServer.tables.templates.items).filter(
            ([ key, val ]) =>       !val._props.QuestItem
                                &&  val._type === "Item"
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.Key)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.LootContainer)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.MobContainer)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.Stash)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.SortingTable)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.Inventory)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.StationaryContainer)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.Pockets)
                                &&  !ItemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.Armband)
                                &&  ItemHelper.getItemPrice(val._id) > 0
        );
    }

    /**
     * Check if the itemId provided is a descendent of the baseclass
     *
     * @param   {string}    itemId          the itemId to check
     * @param   {string}    baseclassId     the baseclass to check for
     * @return  {boolean}                   is the itemId a descendent?
     */
    static isOfBaseclass(itemId, baseclassId)
    {
        return ItemHelper.doesItemOrParentsIdMatch(itemId, baseclassId);
    }

    /**
     * Returns the item price based on the handbook or as a fallback from the prices.json if the item is not
     * found in the handbook. If the price can't be found at all return 0
     *
     * @param {string}      itemId          the itemId to check
     * @returns {integer}                   The price of the item or 0 if not found
     */
    static getItemPrice(itemId)
    {
        const handBookItem = DatabaseServer.tables.templates.handbook.Items.find(x =>
        {
            x.Id === itemId;
        });

        if (handBookItem)
        {
            return handBookItem.price;
        }

        const dynamicPrice = DatabaseServer.tables.templates.prices[itemId];
        if (dynamicPrice)
        {
            return dynamicPrice;
        }

        // we don't need to spam the logs as we know there are some items which are not priced yet
        // we check in ItemsHelper.getRewardableItems() for ItemPrice > 0, only then is it a valid
        // item to be given as reward or requested in a Completion quest
        //Logger.warning(`DailyQuest - No price found for itemId: ${itemId} price defaulting to 0`);
        return 0;
    }

    static fixItemStackCount(item)
    {
        if (item.upd === undefined)
        {
            item.upd = {
                StackObjectsCount: 1
            };
        }

        if (item.upd.StackObjectsCount === undefined)
        {
            item.upd.StackObjectsCount = 1;
        }
        return item;
    }

    /**
     * AmmoBoxes contain StackSlots which need to be filled for the AmmoBox to have content.
     * Here's what a filled AmmoBox looks like:
     *   {
     *       "_id": "b1bbe982daa00ac841d4ae4d",
     *       "_tpl": "57372c89245977685d4159b1",
     *       "parentId": "5fe49a0e2694b0755a504876",
     *       "slotId": "hideout",
     *       "location": {
     *           "x": 3,
     *           "y": 4,
     *           "r": 0
     *       },
     *       "upd": {
     *           "StackObjectsCount": 1
     *       }
     *   },
     *   {
     *       "_id": "b997b4117199033afd274a06",
     *       "_tpl": "56dff061d2720bb5668b4567",
     *       "parentId": "b1bbe982daa00ac841d4ae4d",
     *       "slotId": "cartridges",
     *       "location": 0,
     *       "upd": {
     *           "StackObjectsCount": 30
     *       }
     *   }
     * Given the AmmoBox Item (first object) this function generates the StackSlot (second object) and returns it.
     * StackSlots are only used for AmmoBoxes which only have one element in StackSlots. However, it seems to be generic
     * to possibly also have more than one StackSlot. As good as possible, without seeing items having more than one
     * StackSlot, this function takes account of this and creates and returns an array of StackSlotItems
     *
     * @param {object}      item            The item template of the AmmoBox as given in items.json
     * @param {string}      parentId        The id of the AmmoBox instance these StackSlotItems should be children of
     * @returns {array}                     The array of StackSlotItems
     */
    static generateStackSlotItems(item, parentId)
    {
        const stackSlotItems = [];
        // This is a AmmoBox or something other with Stackslots (nothing exists yet beseids AmmoBoxes afaik)
        for (const stackSlot of item._props.StackSlots)
        {
            const slotId = stackSlot._name;
            const count = stackSlot._max_count;
            // those are all arrays. For AmmoBoxes it's only one element each so we take 0 hardcoded
            // not sure if at any point there will be more than one element - but what so take then?
            const ammoTpl = stackSlot._props.filters[0].Filter[0];
            if (ammoTpl)
            {
                const stackSlotItem = {
                    "_id": HashUtil.generate(),
                    "_tpl": ammoTpl,
                    "parentId": parentId,
                    "slotId": slotId,
                    "location": 0,
                    "upd": {
                        "StackObjectsCount": count
                    }
                };
                stackSlotItems.push(stackSlotItem);
            }
            else
            {
                Logger.warning(`No ids found in Filter for StackSlot ${slotId} of Item ${item._id}.`);
            }
        }
        return stackSlotItems;
    }

    /* Gets item data from items.json
    * */
    static getItem(template)
    {
        // -> Gets item from <input: _tpl>
        if (template in DatabaseServer.tables.templates.items)
        {
            return [true, DatabaseServer.tables.templates.items[template]];
        }

        return [false, {}];
    }

    // get normalized value (0-1) based on item condition
    static getItemQualityModifier(item)
    {
        let result = 1;

        if (item.upd)
        {
            const medkit = (item.upd.MedKit) ? item.upd.MedKit : null;
            const repairable = (item.upd.Repairable) ? item.upd.Repairable : null;

            if (medkit)
            {
                // meds
                result = medkit.HpResource / ItemHelper.getItem(item._tpl)[1]._props.MaxHpResource;
            }

            if (repairable)
            {
                const itemDetails = ItemHelper.getItem(item._tpl)[1];

                // Armour
                if (itemDetails._props.armorClass)
                {
                    result = repairable.Durability / repairable.MaxDurability;
                }
                else
                {
                    // Weapon
                    const durability = repairable.Durability / repairable.MaxDurability;
                    result = Math.sqrt(durability);
                }
            }

            if (result === 0)
            {
                // make item cheap
                result = 0.01;
            }
        }

        return result;
    }

    static findAndReturnChildrenByItems(items, itemID)
    {
        const list = [];

        for (const childitem of items)
        {
            if (childitem.parentId === itemID)
            {
                list.push.apply(list, ItemHelper.findAndReturnChildrenByItems(items, childitem._id));
            }
        }

        list.push(itemID);// it's required
        return list;
    }

    /**
     * A variant of findAndReturnChildren where the output is list of item objects instead of their ids.
     */
    static findAndReturnChildrenAsItems(items, itemID)
    {
        const list = [];

        for (const childitem of items)
        {
            // Include itself.
            if (childitem._id === itemID)
            {
                list.unshift(childitem);
                continue;
            }

            if (childitem.parentId === itemID && !list.find(item => childitem._id === item._id))
            {
                list.push.apply(list, ItemHelper.findAndReturnChildrenAsItems(items, childitem._id));
            }
        }
        return list;
    }

    /**
     * find childs of the item in a given assort (weapons pars for example, need recursive loop function)
     */
    static findAndReturnChildrenByAssort(itemIdToFind, assort)
    {
        let list = [];

        for (const itemFromAssort of assort)
        {
            if (itemFromAssort.parentId === itemIdToFind && !list.find(item => itemFromAssort._id === item._id))
            {
                list.push(itemFromAssort);
                list = list.concat(ItemHelper.findAndReturnChildrenByAssort(itemFromAssort._id, assort));
            }
        }

        return list;
    }

    /**
     * Is Dogtag
     * Checks if an item is a dogtag. Used under profile_f.js to modify preparePrice based
     * on the level of the dogtag
     */
    static isDogtag(itemId)
    {
        return itemId === "59f32bb586f774757e1e8442" || itemId === "59f32c3b86f77472a31742f0";
    }

    static isNotSellable(itemid)
    {
        const items = [
            "544901bf4bdc2ddf018b456d", //wad of rubles
            "5449016a4bdc2d6f028b456f", // rubles
            "569668774bdc2da2298b4568", // euros
            "5696686a4bdc2da3298b456a"  // dollars
        ];

        return items.includes(itemid);
    }

    /* Gets the identifier for a child using slotId, locationX and locationY. */
    static getChildId(item)
    {
        if (!("location" in item))
        {
            return item.slotId;
        }
        return `${item.slotId},${item.location.x},${item.location.y}`;
    }

    static isItemTplStackable(tpl)
    {
        return DatabaseServer.tables.templates.items[tpl]._props.StackMaxSize > 1;
    }

    /**
     * split item stack if it exceeds StackMaxSize
     */
    static splitStack(item)
    {
        if (!("upd" in item) || !("StackObjectsCount" in item.upd))
        {
            return [item];
        }

        const maxStack = DatabaseServer.tables.templates.items[item._tpl]._props.StackMaxSize;
        let count = item.upd.StackObjectsCount;
        const stacks = [];

        // If the current count is already equal or less than the max
        // then just return the item as is.
        if (count <= maxStack)
        {
            stacks.push(JsonUtil.clone(item));
            return stacks;
        }

        while (count)
        {
            const amount = Math.min(count, maxStack);
            const newStack = JsonUtil.clone(item);

            newStack._id = HashUtil.generate();
            newStack.upd.StackObjectsCount = amount;
            count -= amount;
            stacks.push(newStack);
        }

        return stacks;
    }

    /**
     * Find Barter items in the inventory
     * @param {string} by
     * @param {Object} pmcData
     * @param {string} barter_itemID
     * @returns Array
     */
    static findBarterItems(by, pmcData, barter_itemID)
    { // find required items to take after buying (handles multiple items)
        const barterIDs = typeof barter_itemID === "string" ? [barter_itemID] : barter_itemID;
        let itemsArray = [];

        for (const barterID of barterIDs)
        {
            const filterResult = pmcData.Inventory.items.filter(item =>
            {
                return by === "tpl" ? (item._tpl === barterID) : (item._id === barterID);
            });
            itemsArray = Object.assign(itemsArray, filterResult);
        }
        return itemsArray;
    }

    /**
     * @param {Object} pmcData
     * @param {Array} items
     * @param {Object} fastPanel
     * @returns Array
     */
    static replaceIDs(pmcData, items, insuredItems = null, fastPanel = null)
    {
        // replace bsg shit long ID with proper one
        let string_inventory = JsonUtil.serialize(items);

        for (const item of items)
        {
            if (pmcData !== null)
            {
                // insured items shouldn't be renamed
                // only works for pmcs.
                if (insuredItems && insuredItems.find(insuredItem => insuredItem.itemId === item._id))
                {
                    continue;
                }

                // do not replace important ID's
                if (item._id === pmcData.Inventory.equipment
                    || item._id === pmcData.Inventory.questRaidItems
                    || item._id === pmcData.Inventory.questStashItems
                    || item._id === pmcData.Inventory.sortingTable
                    || item._id === pmcData.Inventory.stash)
                {
                    continue;
                }
            }

            // replace id
            const old_id = item._id;
            const new_id = HashUtil.generate();

            string_inventory = string_inventory.replace(new RegExp(old_id, "g"), new_id);

            // Also replace in quick slot if the old ID exists.
            if (fastPanel !== null)
            {
                for (const itemSlot in fastPanel)
                {
                    if (fastPanel[itemSlot] === old_id)
                    {
                        fastPanel[itemSlot] = fastPanel[itemSlot].replace(new RegExp(old_id, "g"), new_id);
                    }
                }
            }
        }

        items = JsonUtil.deserialize(string_inventory);

        // fix duplicate id's
        const dupes = {};
        const newParents = {};
        const childrenMapping = {};
        const oldToNewIds = {};

        // Finding duplicate IDs involves scanning the item three times.
        // First scan - Check which ids are duplicated.
        // Second scan - Map parents to items.
        // Third scan - Resolve IDs.
        for (const item of items)
        {
            dupes[item._id] = (dupes[item._id] || 0) + 1;
        }

        for (const item of items)
        {
            // register the parents
            if (dupes[item._id] > 1)
            {
                const newId = HashUtil.generate();

                newParents[item.parentId] = newParents[item.parentId] || [];
                newParents[item.parentId].push(item);
                oldToNewIds[item._id] = oldToNewIds[item._id] || [];
                oldToNewIds[item._id].push(newId);
            }
        }

        for (const item of items)
        {
            if (dupes[item._id] > 1)
            {
                const oldId = item._id;
                const newId = oldToNewIds[oldId].splice(0, 1)[0];
                item._id = newId;

                // Extract one of the children that's also duplicated.
                if (oldId in newParents && newParents[oldId].length > 0)
                {
                    childrenMapping[newId] = {};
                    for (const childIndex in newParents[oldId])
                    {
                        // Make sure we haven't already assigned another duplicate child of
                        // same slot and location to this parent.
                        const childId = ItemHelper.getChildId(newParents[oldId][childIndex]);

                        if (!(childId in childrenMapping[newId]))
                        {
                            childrenMapping[newId][childId] = 1;
                            newParents[oldId][childIndex].parentId = newId;
                            newParents[oldId].splice(childIndex, 1);
                        }
                    }
                }
            }
        }

        return items;
    }

    /**
     * Recursivly loop down through an items hierarchy to see if any of the ids match the supplied list, return true if any do
     * @param {string} itemId
     * @param {Array} itemIdsToCheck
     * @returns boolean
     */
    static doesItemOrParentsIdMatch(itemId, itemIdsToCheck)
    {
        const itemDetails = this.getItem(itemId);
        const itemExists = itemDetails[0];
        const item = itemDetails[1];

        // not an item, drop out
        if (!itemExists)
        {
            return false;
        }

        // no parent to check
        if (!item._parent)
        {
            return false;
        }

        // Does templateId match any values in itemIdsToCheck array
        if (itemIdsToCheck.includes(item._id))
        {
            return true;
        }

        // Does the items parent type exist in itemIdsToCheck array
        if (itemIdsToCheck.includes(item._parent))
        {
            return true;
        }

        // check items parent with same method
        return this.doesItemOrParentsIdMatch(item._parent, itemIdsToCheck);
    }

    /**
     * Return true if item is a quest item
     * @param {string} itemTplId
     * @returns boolean
     */
    static isQuestItem(itemTplId)
    {
        const itemDetails = ItemHelper.getItem(itemTplId);
        if (itemDetails[0] && itemDetails[1]._props.QuestItem)
        {
            return true;
        }

        return false;
    }
}

module.exports = ItemHelper;

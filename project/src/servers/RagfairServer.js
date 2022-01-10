"use strict";

require("../Lib.js");

class RagfairServer
{
    static toUpdate = {};
    static expiredDynamicOffers = [];
    static offers = [];
    static categories = {};
    static prices = {
        "static": {},
        "dynamic": {}
    };
    static linkedItemsCache = {};
    static requiredItemsCache = {};

    static load()
    {
        RagfairServer.buildLinkedItemTable();
        RagfairServer.generateStaticPrices();
        RagfairServer.generateDynamicPrices();
        RagfairServer.generateDynamicOffers();
        RagfairServer.addTraders();
        RagfairServer.update();
    }

    /* Like getFilters but breaks early and return true if id is found in filters */
    static isInFilter(id, item, slot)
    {
        if (!(slot in item._props && item._props[slot].length))
        {
            // item slot doesnt exist
            return false;
        }

        // get slot
        for (const sub of item._props[slot])
        {
            if (!("_props" in sub && "filters" in sub._props))
            {
                // not a filter
                continue;
            }

            // find item in filter
            for (const filter of sub._props.filters)
            {
                if (filter.Filter.includes(id))
                {
                    return true;
                }
            }
        }

        return false;
    }

    /* Scans a given slot type for filters and returns them as a Set */
    static getFilters(item, slot)
    {
        if (!(slot in item._props && item._props[slot].length))
        {
            // item slot doesnt exist
            return [];
        }

        const filters = [];
        for (const sub of item._props[slot])
        {
            if (!("_props" in sub && "filters" in sub._props))
            {
                // not a filter
                continue;
            }

            for (const filter of sub._props.filters)
            {
                for (const f of filter.Filter)
                {
                    filters.push(f);
                }
            }
        }

        return filters;
    }

    static buildLinkedItemTable()
    {
        const linkedItems = {};
        const getLinkedItems = id =>
        {
            if (!(id in linkedItems))
            {
                linkedItems[id] = new Set();
            }
            return linkedItems[id];
        };

        for (const item of Object.values(DatabaseServer.tables.templates.items))
        {
            const itemLinkedSet = getLinkedItems(item._id);

            const applyLinkedItems = items =>
            {
                for (const linkedItemId of items)
                {
                    itemLinkedSet.add(linkedItemId);
                    getLinkedItems(linkedItemId).add(item._id);
                }
            };

            applyLinkedItems(RagfairServer.getFilters(item, "Slots"));
            applyLinkedItems(RagfairServer.getFilters(item, "Chambers"));
            applyLinkedItems(RagfairServer.getFilters(item, "Cartridges"));
        }

        RagfairServer.linkedItemsCache = linkedItems;
    }

    static buildRequiredItemTable()
    {
        const requiredItems = {};
        const getRequiredItems = id =>
        {
            if (!(id in requiredItems))
            {
                requiredItems[id] = new Set();
            }

            return requiredItems[id];
        };

        for (const offer of RagfairServer.offers)
        {
            for (const requirement of offer.requirements)
            {
                if (PaymentController.isMoneyTpl(requirement._tpl))
                {
                    // This would just be too noisy.
                    continue;
                }

                getRequiredItems(requirement._tpl).add(offer);
            }
        }

        RagfairServer.requiredItemsCache = requiredItems;
    }

    static addPlayerOffers()
    {
        for (const sessionID in SaveServer.profiles)
        {
            const pmcData = SaveServer.profiles[sessionID].characters.pmc;

            if (pmcData.RagfairInfo === undefined || pmcData.RagfairInfo.offers === undefined)
            {
                // profile is wiped
                continue;
            }

            const profileOffers = pmcData.RagfairInfo.offers;
            for (const offer of profileOffers)
            {
                RagfairServer.offers.push(offer);
            }
        }
    }

    static addTraders()
    {
        for (const traderID in DatabaseServer.tables.traders)
        {
            RagfairServer.toUpdate[traderID] = RagfairConfig.traders[traderID] || false;
        }
    }

    static update()
    {
        // remove expired offers
        const time = TimeUtil.getTimestamp();

        for (const i in RagfairServer.offers)
        {
            const offer = RagfairServer.offers[i];

            if (RagfairServer.isExpired(offer, time))
            {
                const isTrader = RagfairServer.isTrader(offer.user.id);
                const isPlayer = RagfairServer.isPlayer(offer.user.id.replace(/^pmc/, ""));

                // update trader if offers expired
                if (isTrader)
                {
                    RagfairServer.toUpdate[offer.user.id] = true;
                }

                if (!isTrader && !isPlayer)
                {
                    // Dynamic offer
                    RagfairServer.expiredDynamicOffers.push(offer.items[0]);
                }

                // Players need their items returning, and maybe their XP adjusting
                if (isPlayer)
                {
                    RagfairServer.returnPlayerOffer(offer);
                }

                // remove offer
                RagfairServer.offers.splice(i, 1);
            }
        }

        // generate trader offers
        for (const traderID in RagfairServer.toUpdate)
        {
            if (RagfairServer.toUpdate[traderID])
            {
                // trader offers expired or no offers found
                RagfairServer.generateTraderOffers(traderID);
                RagfairServer.toUpdate[traderID] = false;
            }
        }

        // Regen expired offers when over threshold count
        if (RagfairServer.expiredDynamicOffers.length >= RagfairConfig.dynamic.expiredOfferThreshold)
        {
            RagfairServer.generateDynamicPrices();
            RagfairServer.generateDynamicOffers(RagfairServer.expiredDynamicOffers);
        }

        // set available categories
        for (const offer of RagfairServer.offers)
        {
            RagfairServer.categories[offer.items[0]._tpl] = 1;
        }

        RagfairServer.buildRequiredItemTable();
    }

    static generateTraderOffers(traderID)
    {
        // ensure old offers don't exist
        RagfairServer.offers = RagfairServer.offers.filter((offer) =>
        {
            return offer.user.id !== traderID;
        });

        // add trader offers
        const time = TimeUtil.getTimestamp();
        let assort = DatabaseServer.tables.traders[traderID].assort;

        if (traderID === "579dc571d53a0658a154fbec")
        {
            assort = TraderController.fenceAssort || { "items": [] };
        }

        for (const item of assort.items)
        {
            if (item.slotId !== "hideout")
            {
                // skip mod items
                continue;
            }

            const isPreset = PresetController.isPreset(item._id);
            const items = (isPreset) ? RagfairServer.getPresetItems(item) : [...[item], ...ItemHelper.findAndReturnChildrenByAssort(item._id, assort.items)];
            const barterScheme = assort.barter_scheme[item._id][0];
            const loyalLevel = assort.loyal_level_items[item._id];
            const price = RagfairServer.getBarterPrice(barterScheme);

            // create offer
            RagfairServer.createOffer(traderID, time, items, barterScheme, loyalLevel, price);
        }
    }

    static generateDynamicOffers(expiredOffers = null)
    {
        const config = RagfairConfig.dynamic;
        const assort = JsonUtil.clone(DatabaseServer.tables.traders["ragfair"].assort);

        let assortItems;
        if (expiredOffers)
        {
            assortItems = expiredOffers;
        }
        else
        {
            assortItems = assort.items.filter((item) =>
            {
                return item.slotId === "hideout";
            });
        }

        for (const itemIndex in assortItems)
        {
            // get base item and stack
            const item = assortItems[itemIndex];
            const itemDetails = ItemHelper.getItem(item._tpl);

            // Skip non-items
            if (!itemDetails[0])
            {
                continue;
            }

            // Skip item if found in blacklist
            if (RagfairServer.isItemInDynamicBlacklist(item._tpl))
            {
                continue;
            }

            // perform quest item check if feature flag enabled
            if (config.blacklist.enableQuestList && ItemHelper.isQuestItem(item._tpl))
            {
                continue;
            }

            // Dont list items that bsg deem as unsellable on flea
            if (config.blacklist.enableBsgList && !itemDetails[1]._props.CanSellOnRagfair)
            {
                continue;
            }

            const isPreset = PresetController.isPreset(item._id);
            let items = (isPreset) ? RagfairServer.getPresetItems(item) : [...[item], ...ItemHelper.findAndReturnChildrenByAssort(item._id, assort.items)];

            // Get number of offers to show for item and add to ragfairServer
            const itemCount = (expiredOffers) ? 1 : Math.round(RandomUtil.getInt(config.offerItemCount.min, config.offerItemCount.max));
            for (let index = 0; index < itemCount; index++)
            {
                items[0].upd.StackObjectsCount = RagfairServer.CalculateDynamicStackCount(items[0]._tpl, isPreset);

                const userID = HashUtil.generate();
                // get properties
                items = RagfairServer.getItemCondition(userID, items);
                const barterScheme = RagfairServer.getOfferRequirements(items);
                const price = RagfairServer.getBarterPrice(barterScheme);

                RagfairServer.createOffer(
                    userID,                                     // userID
                    TimeUtil.getTimestamp(),                    // time
                    items,                                      // items
                    barterScheme,                               // barter scheme
                    assort.loyal_level_items[item._id],         // loyal level
                    price,                                      // price
                    isPreset);                                  // sellAsOnePiece
            }

            if (expiredOffers)
            {
                expiredOffers.splice(itemIndex, 1);
            }
        }

        Logger.debug(`generated ${assortItems.length} dynamic offers`);
    }

    static CalculateDynamicStackCount(tplId, isWeaponPreset)
    {
        const config = RagfairConfig.dynamic;

        // Lookup item details - check if item not found
        const itemDetails = ItemHelper.getItem(tplId);
        if (!itemDetails[0])
        {
            throw new Error(`Item with tpl ${tplId} not found. Unable to generate a dynamic stack count.`);
        }

        // Item Types to return one of
        if (isWeaponPreset || ItemHelper.doesItemOrParentsIdMatch(itemDetails[1]._id, RagfairConfig.dynamic.showAsSingleStack))
        {
            return 1;
        }

        // Get max stack count
        const maxStackCount = itemDetails[1]._props.StackMaxSize;

        // non-stackable - use differnt values to calcualte stack size
        if (!maxStackCount || maxStackCount === 1)
        {
            return Math.round(RandomUtil.getInt(config.nonStackableCount.min, config.nonStackableCount.max));
        }

        const stackPercent = Math.round(RandomUtil.getInt(config.stackablePercent.min, config.stackablePercent.max));

        return Math.round((maxStackCount / 100) * stackPercent);
    }

    static isItemInDynamicBlacklist(itemTemplateId)
    {
        return RagfairConfig.dynamic.blacklist.custom.includes(itemTemplateId);
    }

    static createOffer(userID, time, items, barterScheme, loyalLevel, price, sellInOnePiece = false)
    {
        const isTrader = RagfairServer.isTrader(userID);
        const trader = DatabaseServer.tables.traders[(isTrader) ? userID : "ragfair"].base;

        const offer = {
            "_id": (isTrader) ? items[0]._id : HashUtil.generate(),
            "intId": 0,
            "user": {
                "id": RagfairServer.getTraderId(userID),
                "memberType": (userID !== "ragfair") ? RagfairServer.getMemberType(userID) : 0,
                "nickname": RagfairServer.getNickname(userID),
                "rating": RagfairServer.getRating(userID),
                "isRatingGrowing": RagfairServer.getRatingGrowing(userID),
                "avatar": trader.avatar
            },
            "root": items[0]._id,
            "items": JsonUtil.clone(items),
            "requirements": barterScheme,
            "requirementsCost": price,
            "itemsCost": price,
            "summaryCost": price,
            "startTime": time,
            "endTime": RagfairServer.getOfferEndTime(userID, time),
            "loyaltyLevel": loyalLevel,
            "sellInOnePiece": sellInOnePiece,
            "priority": false
        };

        RagfairServer.offers.push(offer);
        return offer;
    }

    static getTraderId(userID)
    {
        if (RagfairServer.isPlayer(userID))
        {
            return SaveServer.profiles[userID].characters.pmc._id;
        }
        return userID;
    }

    static getMemberType(userID)
    {
        if (RagfairServer.isPlayer(userID))
        {
            // player offer
            return SaveServer.profiles[userID].characters.pmc.Info.AccountType;
        }

        if (RagfairServer.isTrader(userID))
        {
            // trader offer
            return 4;
        }

        // generated offer
        return 0;
    }

    static getNickname(userID)
    {
        if (RagfairServer.isPlayer(userID))
        {
            // player offer
            return SaveServer.profiles[userID].characters.pmc.Info.Nickname;
        }

        if (RagfairServer.isTrader(userID))
        {
            // trader offer
            return DatabaseServer.tables.traders[userID].base.nickname;
        }

        // generated offer
        // recurse if name is longer than max characters allowed (15 characters)
        const type = (RandomUtil.getInt(0, 1) === 0) ? "usec" : "bear";
        const name = RandomUtil.getArrayValue(DatabaseServer.tables.bots.types[type].firstName);
        return (name.length > 15) ? RagfairServer.getNickname(userID) : name;
    }

    static getOfferEndTime(userID, time)
    {
        if (RagfairServer.isPlayer(userID))
        {
            // player offer
            return TimeUtil.getTimestamp() + Math.round(12 * 3600);
        }

        if (RagfairServer.isTrader(userID))
        {
            // trader offer
            return DatabaseServer.tables.traders[userID].base.nextResupply;
        }

        // generated offer
        return Math.round(time + RandomUtil.getInt(RagfairConfig.dynamic.endTimeSeconds.min, RagfairConfig.dynamic.endTimeSeconds.max));
    }

    static getRating(userID)
    {
        if (RagfairServer.isPlayer(userID))
        {
            // player offer
            return SaveServer.profiles[userID].characters.pmc.RagfairInfo.rating;
        }

        if (RagfairServer.isTrader(userID))
        {
            // trader offer
            return 1;
        }

        // generated offer
        return RandomUtil.getFloat(RagfairConfig.dynamic.rating.min, RagfairConfig.dynamic.rating.max);
    }

    static getRatingGrowing(userID)
    {
        if (RagfairServer.isPlayer(userID))
        {
            // player offer
            return SaveServer.profiles[userID].characters.pmc.RagfairInfo.isRatingGrowing;
        }

        if (RagfairServer.isTrader(userID))
        {
            // trader offer
            return true;
        }

        // generated offer
        return RandomUtil.getBool();
    }

    static getItemCondition(userID, items)
    {
        const item = RagfairServer.addMissingCondition(items[0]);

        if (!RagfairServer.isPlayer(userID) && !RagfairServer.isTrader(userID))
        {
            const multiplier = RandomUtil.getFloat(RagfairConfig.dynamic.condition.min, RagfairConfig.dynamic.condition.max);

            if ("Repairable" in item.upd)
            {
                // randomize durability
                item.upd.Repairable.Durability = Math.round(item.upd.Repairable.Durability * multiplier) || 1;
            }

            if ("MedKit" in item.upd)
            {
                // randomize health
                item.upd.MedKit.HpResource = Math.round(item.upd.MedKit.HpResource * multiplier) || 1;
            }
        }

        items[0] = item;
        return items;
    }

    static addMissingCondition(item)
    {
        const props = ItemHelper.getItem(item._tpl)[1]._props;
        const isRepairable = ("Durability" in props);
        const isMedkit = ("MaxHpResource" in props);

        if (isRepairable && props.Durability > 0)
        {
            item.upd.Repairable = {
                "Durability": props.Durability,
                "MaxDurability": props.Durability
            };
        }

        if (isMedkit && props.MaxHpResource > 0)
        {
            item.upd.MedKit = {
                "HpResource": props.MaxHpResource,
            };
        }

        return item;
    }

    static getDynamicOfferCurrency()
    {
        const currencies = RagfairConfig.dynamic.currencies;
        const bias = [];

        for (const item in currencies)
        {
            for (let i = 0; i < currencies[item]; i++)
            {
                bias.push(item);
            }
        }

        return bias[Math.floor(Math.random() * bias.length)];
    }

    static getDynamicOfferPrice(items, desiredCurrency)
    {
        let price = 0;

        let endLoop = false;
        for (const item of items)
        {
            // Get dynamic price, fallback to handbook price if value of 1 found
            let itemDynamicPrice = RagfairServer.prices.dynamic[item._tpl];
            if (!itemDynamicPrice || itemDynamicPrice === 1)
            {
                itemDynamicPrice = HandbookController.getTemplatePrice(item._tpl);
            }

            // Check if item type is weapon, handle differently
            const itemDetails = ItemHelper.getItem(item._tpl);
            if (PresetController.isPreset(item._id) && itemDetails[1]._props.weapFireType)
            {
                itemDynamicPrice = RagfairServer.getWeaponPresetPrice(item, items, itemDynamicPrice);
                endLoop = true;
            }

            // Convert to different currency if desiredCurrency param is not roubles
            if (desiredCurrency !== "5449016a4bdc2d6f028b456f")
            {
                itemDynamicPrice = PaymentController.fromRUB(itemDynamicPrice, desiredCurrency);
            }

            // Multiply dynamic price by quality modifier
            const itemQualityModifier = ItemHelper.getItemQualityModifier(item);
            price += itemDynamicPrice * itemQualityModifier;

            // Stop loop if weapon preset price function has been run
            if (endLoop)
            {
                break;
            }
        }

        price = Math.round(price * RandomUtil.getFloat(RagfairConfig.dynamic.price.min, RagfairConfig.dynamic.price.max));

        if (price < 1)
        {
            price = 1;
        }

        return price;
    }

    static getWeaponPresetPrice(item, items, existingPrice)
    {
        // Get all presets for this weapon type
        // If no presets found, return existing price
        const presets = PresetController.getPresets(item._tpl);
        if (!presets || presets.length === 0)
        {
            Logger.warning(`Item Id: ${item._tpl} has no presets`);
            return existingPrice;
        }

        // Get the default preset for this weapon (assumes default = has encyclopedia entry)
        // If no default preset, use first preset
        let defaultPreset = presets.find(x => x._encyclopedia);
        if (!defaultPreset)
        {
            Logger.warning(`Item Id: ${item._tpl} has no encyclopedia entry`);
            defaultPreset = presets[0];
        }

        // Get mods on current gun not in default preset
        const newOrReplacedModsInPresetVsDefault = items.filter(x => !defaultPreset._items.some(y => y._tpl === x._tpl));

        // Add up extra mods price
        let extraModsPrice = 0;
        for (const mod of newOrReplacedModsInPresetVsDefault)
        {
            extraModsPrice += RagfairServer.prices.dynamic[mod._tpl];
        }

        // Only deduct cost of replaced mods if there's replaced/new mods
        if (newOrReplacedModsInPresetVsDefault.length >= 1)
        {
            // Add up cost of mods replaced
            const modsReplacedByNewMods = newOrReplacedModsInPresetVsDefault.filter(x => defaultPreset._items.some(y => y.slotId === x.slotId));

            // Add up replaced mods price
            let replacedModsPrice = 0;
            for (const replacedMod of modsReplacedByNewMods)
            {
                replacedModsPrice += RagfairServer.prices.dynamic[replacedMod._tpl];
            }

            // Subtract replaced mods total from extra mods total
            extraModsPrice -= replacedModsPrice;
        }

        // return extra mods price + base gun price
        return existingPrice += extraModsPrice;
    }

    static getOfferRequirements(items)
    {
        const currency = RagfairServer.getDynamicOfferCurrency();
        const price = RagfairServer.getDynamicOfferPrice(items, currency);

        return [
            {
                "count": price,
                "_tpl": currency
            }
        ];
    }

    static getBarterPrice(barterScheme)
    {
        let price = 0;

        for (const item of barterScheme)
        {
            price += (RagfairServer.prices.static[item._tpl] * item.count);
        }

        return Math.round(price);
    }

    static generateStaticPrices()
    {
        for (const itemID in DatabaseServer.tables.templates.items)
        {
            RagfairServer.prices.static[itemID] = Math.round(HandbookController.getTemplatePrice(itemID));
        }
    }

    static generateDynamicPrices()
    {
        const dynamic = { ...RagfairServer.prices.static, ...DatabaseServer.tables.templates.prices };

        for (const itemID in dynamic)
        {
            // ensure all dynamic offers have a value (some don't by default)
            RagfairServer.prices.dynamic[itemID] = dynamic[itemID] || 1;
        }
    }

    static getOffer(offerID)
    {
        return JsonUtil.clone(RagfairServer.offers.find((item) =>
        {
            return item._id === offerID;
        }));
    }

    static getPresetItems(item)
    {
        const preset = JsonUtil.clone(DatabaseServer.tables.globals.ItemPresets[item._id]._items);
        return RagfairServer.reparentPresets(item, preset);
    }

    static getPresetItemsByTpl(item)
    {
        const presets = [];

        for (const itemId in DatabaseServer.tables.globals.ItemPresets)
        {
            if (DatabaseServer.tables.globals.ItemPresets[itemId]._items[0]._tpl === item._tpl)
            {
                const preset = JsonUtil.clone(DatabaseServer.tables.globals.ItemPresets[itemId]._items);
                presets.push(RagfairServer.reparentPresets(item, preset));
            }
        }

        return presets;
    }

    static reparentPresets(item, preset)
    {
        const oldRootId = preset[0]._id;
        const idMappings = {};

        idMappings[oldRootId] = item._id;

        for (const mod of preset)
        {
            if (idMappings[mod._id] === undefined)
            {
                idMappings[mod._id] = HashUtil.generate();
            }

            if (mod.parentId !== undefined && idMappings[mod.parentId] === undefined)
            {
                idMappings[mod.parentId] = HashUtil.generate();
            }

            mod._id =  idMappings[mod._id];

            if (mod.parentId !== undefined)
            {
                mod.parentId =  idMappings[mod.parentId];
            }
        }

        preset[0] = item;
        return preset;
    }

    static returnPlayerOffer(offer)
    {
        const pmcID = String(offer.user.id);
        const profile = ProfileController.getProfileByPmcId(pmcID);
        const sessionID = profile.aid;
        const index = profile.RagfairInfo.offers.findIndex(o => o._id === offer._id);

        profile.RagfairInfo.rating -= RagfairConfig.sell.reputation.loss;
        profile.RagfairInfo.isRatingGrowing = false;

        if (index === -1)
        {
            Logger.warning(`Could not find offer to remove with offerId -> ${offer._id}`);
            return HttpResponse.appendErrorToOutput(ItemEventRouter.getOutput(sessionID), "Offer not found in profile");
        }

        if (offer.items[0].upd.StackObjectsCount > offer.items[0].upd.OriginalStackObjectsCount)
        {
            offer.items[0].upd.StackObjectsCount = offer.items[0].upd.OriginalStackObjectsCount;
        }
        delete offer.items[0].upd.OriginalStackObjectsCount;

        RagfairController.returnItems(profile.aid, offer.items);
        profile.RagfairInfo.offers.splice(index, 1);
        RagfairServer.offers.splice(RagfairServer.offers.findIndex(o => o._id === offer._id), 1);

        return ItemEventRouter.getOutput(sessionID);
    }

    static removeOfferStack(offerID, amount)
    {
        // remove stack from offer
        for (const offer in RagfairServer.offers)
        {
            if (RagfairServer.offers[offer]._id === offerID)
            {
                // found offer
                RagfairServer.offers[offer].items[0].upd.StackObjectsCount -= amount;
                break;
            }
        }
    }

    static isExpired(offer, time)
    {
        return offer.endTime < time || offer.items[0].upd.StackObjectsCount < 1;
    }

    static isTrader(userID)
    {
        return userID in DatabaseServer.tables.traders;
    }

    static isPlayer(userID)
    {
        if (ProfileController.getPmcProfile(userID) !== undefined)
        {
            return true;
        }
        return false;
    }
}

module.exports = RagfairServer;

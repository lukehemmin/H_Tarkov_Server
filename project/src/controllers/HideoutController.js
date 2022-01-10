"use strict";

require("../Lib.js");

const areaTypes = {
    VENTS: 0,
    SECURITY: 1,
    LAVATORY: 2,
    STASH: 3,
    GENERATOR: 4,
    HEATING: 5,
    WATER_COLLECTOR: 6,
    MEDSTATION: 7,
    NUTRITION_UNIT: 8,
    REST_SPACE: 9,
    WORKBENCH: 10,
    INTEL_CENTER: 11,
    SHOOTING_RANGE: 12,
    LIBRARY: 13,
    SCAV_CASE: 14,
    ILLUMINATION: 15,
    PLACE_OF_FAME: 16,
    AIR_FILTERING: 17,
    SOLAR_POWER: 18,
    BOOZE_GENERATOR: 19,
    BITCOIN_FARM: 20,
    CHRISTMAS_TREE: 21
};

// Production recipe made from these areas
const BITCOIN_FARM = "5d5c205bd582a50d042a3c0e";
const WATER_COLLECTOR = "5d5589c1f934db045e6c5492";

class HideoutController
{
    static upgrade(pmcData, body, sessionID)
    {
        const output = ItemEventRouter.getOutput(sessionID);
        const items = body.items.map(reqItem =>
        {
            const item = pmcData.Inventory.items.find(invItem => invItem._id === reqItem.id);
            return {
                inventoryItem: item,
                requestedItem: reqItem
            };
        });

        // If it's not money, its construction / barter items
        for (const item of items)
        {
            if (!item.inventoryItem)
            {
                Logger.error(`Failed to find item in inventory with id ${item.requestedItem.id}`);
                return HttpResponse.appendErrorToOutput(output);
            }

            if (PaymentController.isMoneyTpl(item.inventoryItem._tpl)
                && item.inventoryItem.upd
                && item.inventoryItem.upd.StackObjectsCount
                && item.inventoryItem.upd.StackObjectsCount > item.requestedItem.count)
            {
                item.inventoryItem.upd.StackObjectsCount -= item.requestedItem.count;
            }
            else
            {
                InventoryController.removeItem(pmcData, item.inventoryItem._id, sessionID, output);
            }
        }

        // Construction time management
        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === body.areaType);
        if (!hideoutArea)
        {
            Logger.error(`Could not find area of type ${body.areaType}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        const hideoutData = DatabaseServer.tables.hideout.areas.find(area => area.type === body.areaType);

        if (!hideoutData)
        {
            Logger.error(`Could not find area in database of type ${body.areaType}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        const ctime = hideoutData.stages[hideoutArea.level + 1].constructionTime;

        if (ctime > 0)
        {
            const timestamp = TimeUtil.getTimestamp();

            hideoutArea.completeTime = timestamp + ctime;
            hideoutArea.constructing = true;
        }

        return output;
    }

    static upgradeComplete(pmcData, body, sessionID)
    {
        const output = ItemEventRouter.getOutput(sessionID);
        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === body.areaType);

        if (!hideoutArea)
        {
            Logger.error(`Could not find area of type ${body.areaType}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        // Upgrade area
        hideoutArea.level++;
        hideoutArea.completeTime = 0;
        hideoutArea.constructing = false;

        const hideoutData = DatabaseServer.tables.hideout.areas.find(area => area.type === hideoutArea.type);

        if (!hideoutData)
        {
            Logger.error(`Could not find area in database of type ${body.areaType}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        // Apply bonuses
        const bonuses = hideoutData.stages[hideoutArea.level].bonuses;

        if (bonuses.length > 0)
        {
            for (const bonus of bonuses)
            {
                HideoutController.applyPlayerUpgradesBonuses(pmcData, bonus);
            }
        }

        return output;
    }

    // Move items from hideout
    static putItemsInAreaSlots(pmcData, body, sessionID)
    {
        let output = ItemEventRouter.getOutput(sessionID);

        const items = Object.entries(body.items).map(kvp =>
        {
            const item = pmcData.Inventory.items.find(invItem => invItem._id === kvp[1].id);
            return {
                inventoryItem: item,
                requestedItem: kvp[1],
                slot: kvp[0]
            };
        });

        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === body.areaType);
        if (!hideoutArea)
        {
            Logger.error(`Could not find area of type ${body.areaType}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        for (const item of items)
        {
            if (!item.inventoryItem)
            {
                Logger.error(`Failed to find item in inventory with id ${item.requestedItem.id}`);
                return HttpResponse.appendErrorToOutput(output);
            }

            const slot_position = item.slot;
            const slot_to_add = {
                "item": [{
                    "_id": item.inventoryItem._id,
                    "_tpl": item.inventoryItem._tpl,
                    "upd": item.inventoryItem.upd
                }]
            };

            if (!(slot_position in hideoutArea.slots))
            {
                hideoutArea.slots.push(slot_to_add);
            }
            else
            {
                hideoutArea.slots.splice(slot_position, 1, slot_to_add);
            }

            output = InventoryController.removeItem(pmcData, item.inventoryItem._id, sessionID, output);
        }

        return output;
    }

    static takeItemsFromAreaSlots(pmcData, body, sessionID)
    {
        let output = ItemEventRouter.getOutput(sessionID);

        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === body.areaType);
        if (!hideoutArea)
        {
            Logger.error(`Could not find area of type ${body.areaType}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        if (hideoutArea.type === areaTypes.GENERATOR)
        {
            const itemToMove = hideoutArea.slots[body.slots[0]].item[0];
            const newReq = {
                "items": [{
                    "item_id": itemToMove._tpl,
                    "count": 1,
                }],
                "tid": "ragfair"
            };

            output = InventoryController.addItem(pmcData, newReq, output, sessionID, null);

            // If addItem returned with errors, don't continue any further
            if (output.warnings && output.warnings.length > 0)
            {
                return output;
            }

            pmcData = ProfileController.getPmcProfile(sessionID);
            output.profileChanges[sessionID].items.new[0].upd = itemToMove.upd;

            const item = pmcData.Inventory.items.find(i => i._id === output.profileChanges[sessionID].items.new[0]._id);
            if (item)
            {
                item.upd = itemToMove.upd;
            }
            else
            {
                Logger.error(`Could not find item in inventory with id ${output.profileChanges[sessionID].items.new[0]._id}`);
            }

            hideoutArea.slots[body.slots[0]] = {
                "item": null
            };
        }
        else
        {
            if (!hideoutArea.slots[0] || !hideoutArea.slots[0].item[0] || !hideoutArea.slots[0].item[0]._tpl)
            {
                Logger.error(`Could not find item to take out of slot 0 for areaType ${hideoutArea.type}`);
                return HttpResponse.appendErrorToOutput(output);
            }

            const newReq = {
                "items": [{
                    "item_id": hideoutArea.slots[0].item[0]._tpl,
                    "count": 1,
                }],
                "tid": "ragfair"
            };

            output = InventoryController.addItem(pmcData, newReq, output, sessionID, null);

            // If addItem returned with errors, don't continue any further
            if (output.warnings && output.warnings.length > 0)
            {
                return output;
            }

            hideoutArea.slots.splice(0, 1);
        }

        return output;
    }

    static toggleArea(pmcData, body, sessionID)
    {
        const output = ItemEventRouter.getOutput(sessionID);
        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === body.areaType);

        if (!hideoutArea)
        {
            Logger.error(`Could not find area of type ${body.areaType}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        hideoutArea.active = body.enabled;

        return output;
    }

    static singleProductionStart(pmcData, body, sessionID)
    {
        HideoutController.registerProduction(pmcData, body, sessionID);

        let output = ItemEventRouter.getOutput(sessionID);

        for (const itemToDelete of body.items)
        {
            output = InventoryController.removeItem(pmcData, itemToDelete.id, sessionID, output);
        }

        return output;
    }

    /**
     * This convinience function intialies new Production Object
     * with all the constants.
     * @param {*} recipeId
     * @param {*} productionTime
     * @returns object
     */
    static initProduction(recipeId, productionTime)
    {
        return {
            "Progress": 0,
            "inProgress": true,
            "RecipeId": recipeId,
            "Products": [],
            "SkipTime": 0,
            "ProductionTime": productionTime,
            "StartTimestamp": TimeUtil.getTimestamp()
        };
    }

    static scavCaseProductionStart(pmcData, body, sessionID)
    {
        let output = ItemEventRouter.getOutput(sessionID);

        for (const requestedItem of body.items)
        {
            const inventoryItem = pmcData.Inventory.items.find(item => item._id === requestedItem.id);
            if (!inventoryItem)
            {
                Logger.error(`Could not find item requested by ScavCase with id ${requestedItem.id}`);
                return HttpResponse.appendErrorToOutput(output);
            }

            if (inventoryItem.upd
                && inventoryItem.upd.StackObjectsCount
                && inventoryItem.upd.StackObjectsCount > requestedItem.count)
            {
                inventoryItem.upd.StackObjectsCount -= requestedItem.count;
            }
            else
            {
                output = InventoryController.removeItem(pmcData, requestedItem.id, sessionID, output);
            }
        }

        const recipe = DatabaseServer.tables.hideout.scavcase.find(r => r._id === body.recipeId);
        if (!recipe)
        {
            Logger.error(`Failed to find Scav Case recipe with id ${body.recipeId}`);
            return HttpResponse.appendErrorToOutput(output);
        }

        const rarityItemCounter = {};
        const products = [];

        for (const rarity in recipe.EndProducts)
        {
            // TODO: This ensures ScavCase always has the max amount of items possible. Should probably randomize this
            if (recipe.EndProducts[rarity].max > 0)
            {
                rarityItemCounter[rarity] = recipe.EndProducts[rarity].max;
            }
        }

        // TODO: This probably needs to be rewritten eventually, as poking at random items
        // and hoping to find one of the correct rarity is wildly inefficient and inconsistent
        for (const rarityType in rarityItemCounter)
        {
            while (rarityItemCounter[rarityType] > 0)
            {
                const random = RandomUtil.getIntEx(Object.keys(DatabaseServer.tables.templates.items).length);
                const randomKey = Object.keys(DatabaseServer.tables.templates.items)[random];
                const tempItem = DatabaseServer.tables.templates.items[randomKey];

                if (tempItem._props && tempItem._props.Rarity === rarityType)
                {
                    products.push({
                        "_id": HashUtil.generate(),
                        "_tpl": tempItem._id
                    });

                    rarityItemCounter[rarityType] -= 1;
                }
            }
        }

        pmcData.Hideout.Production.ScavCase = {
            "Products": products
        };

        // @Important: Here we need to be very exact:
        // - normal recipe: Production time value is stored in attribute "productionType" with small "p"
        // - scav case recipe: Production time value is stored in attribute "ProductionType" with capital "P"
        pmcData.Hideout.Production[body.recipeId] = HideoutController.initProduction(body.recipeId, recipe.ProductionTime);

        return output;
    }

    static continuousProductionStart(pmcData, body, sessionID)
    {
        HideoutController.registerProduction(pmcData, body, sessionID);
        return ItemEventRouter.getOutput(sessionID);
    }

    static getBTC(pmcData, body, sessionID)
    {
        const output = ItemEventRouter.getOutput(sessionID);

        const bitCoinCount = pmcData.Hideout.Production[BITCOIN_FARM].Products.length;
        if (!bitCoinCount)
        {
            Logger.error("No bitcoins are ready for pickup!");
            return HttpResponse.appendErrorToOutput(output);
        }

        const newBTC = {
            "items": [{
                "item_id": "59faff1d86f7746c51718c9c",
                "count": pmcData.Hideout.Production[BITCOIN_FARM].Products.length,
            }],
            "tid": "ragfair"
        };

        const callback = () =>
        {
            pmcData.Hideout.Production[BITCOIN_FARM].Products = [];
        };

        return InventoryController.addItem(pmcData, newBTC, output, sessionID, callback, true);
    }

    static takeProduction(pmcData, body, sessionID)
    {
        const output = ItemEventRouter.getOutput(sessionID);

        if (body.recipeId === BITCOIN_FARM)
        {
            return HideoutController.getBTC(pmcData, body, sessionID);
        }

        let recipe = DatabaseServer.tables.hideout.production.find(r => r._id === body.recipeId);
        if (recipe)
        {
            // create item and throw it into profile
            let id = recipe.endProduct;

            // replace the base item with its main preset
            if (PresetController.hasPreset(id))
            {
                id = PresetController.getStandardPreset(id)._id;
            }

            const newReq = {
                "items": [{
                    "item_id": id,
                    "count": recipe.count,
                }],
                "tid": "ragfair"
            };

            const kvp = Object.entries(pmcData.Hideout.Production).find(kvp => kvp[1].RecipeId === body.recipeId);
            if (!kvp || !kvp[0])
            {
                Logger.error(`Could not find production in pmcData with RecipeId ${body.recipeId}`);
                return HttpResponse.appendErrorToOutput(output);
            }

            // delete the production in profile Hideout.Production if addItem passes validation
            const callback = () =>
            {
                delete pmcData.Hideout.Production[kvp[0]];
            };

            return InventoryController.addItem(pmcData, newReq, output, sessionID, callback, true);
        }

        recipe = DatabaseServer.tables.hideout.scavcase.find(r => r._id === body.recipeId);
        if (recipe)
        {
            const kvp = Object.entries(pmcData.Hideout.Production).find(kvp => kvp[1].RecipeId === body.recipeId);
            if (!kvp || !kvp[0])
            {
                Logger.error(`Could not find production in pmcData with RecipeId ${body.recipeId}`);
                return HttpResponse.appendErrorToOutput(output);
            }
            const prod = kvp[0];

            pmcData.Hideout.Production[prod].Products = pmcData.Hideout.Production.ScavCase.Products;

            const itemsToAdd = pmcData.Hideout.Production[prod].Products.map(x =>
            {
                return { "item_id": x._tpl, "count": 1 };
            });

            const newReq = {
                "items": itemsToAdd,
                "tid": "ragfair"
            };

            const callback = () =>
            {
                delete pmcData.Hideout.Production[prod];
                delete pmcData.Hideout.Production.ScavCase;
            };

            return InventoryController.addItem(pmcData, newReq, output, sessionID, callback, true);
        }

        Logger.error(`Failed to locate any recipe with id ${body.recipeId}`);
        return HttpResponse.appendErrorToOutput(output);
    }

    static registerProduction(pmcData, body, sessionID)
    {
        const recipe = DatabaseServer.tables.hideout.production.find(p => p._id === body.recipeId);
        if (!recipe)
        {
            Logger.error(`Failed to locate recipe with _id ${body.recipeId}`);
            return HttpResponse.appendErrorToOutput(ItemEventRouter.getOutput(sessionID));
        }

        // @Important: Here we need to be very exact:
        // - normal recipe: Production time value is stored in attribute "productionType" with small "p"
        // - scav case recipe: Production time value is stored in attribute "ProductionType" with capital "P"
        pmcData.Hideout.Production[body.recipeId] = HideoutController.initProduction(body.recipeId, recipe.productionTime);
    }

    // BALIST0N, I got bad news for you
    // we do need to implement these after all
    // ...
    // with that I mean manual implementation
    // RIP, GL whoever is going to do this
    static applyPlayerUpgradesBonuses(pmcData, bonus)
    {
        switch (bonus.type)
        {
            case "StashSize":

                for (const item in pmcData.Inventory.items)
                {
                    if (pmcData.Inventory.items[item]._id === pmcData.Inventory.stash)
                    {
                        pmcData.Inventory.items[item]._tpl = bonus.templateId;
                    }
                }
                break;

            case "MaximumEnergyReserve":
                pmcData.Health.Energy.Maximum = 110;
                break;

            case "EnergyRegeneration":
            case "HydrationRegeneration":
            case "HealthRegeneration":
            case "DebuffEndDelay":
            case "ScavCooldownTimer":
            case "QuestMoneyReward":
            case "InsuranceReturnTime":
            case "ExperienceRate":
            case "SkillGroupLevelingBoost":
            case "RagfairCommission":
            case "AdditionalSlots":
            case "UnlockWeaponModification":
            case "TextBonus":
            case "FuelConsumption":
                break;
        }

        pmcData.Bonuses.push(bonus);
    }

    static update()
    {
        for (const sessionID in SaveServer.profiles)
        {
            if ("Hideout" in SaveServer.profiles[sessionID].characters.pmc)
            {
                HideoutController.updatePlayerHideout(sessionID);
            }
        }
    }

    static updatePlayerHideout(sessionID)
    {
        const recipes = DatabaseServer.tables.hideout.production;
        const pmcData = ProfileController.getPmcProfile(sessionID);
        let btcFarmCGs = 0;
        let isGeneratorOn = false;
        let WaterCollectorHasFilter = false;

        const solarArea = pmcData.Hideout.Areas.find(area => area.type === areaTypes.SOLAR_POWER);
        const solarPowerLevel = solarArea ? solarArea.level : 0;

        for (let area of pmcData.Hideout.Areas)
        {
            switch (area.type)
            {
                case areaTypes.GENERATOR:
                    isGeneratorOn = area.active;

                    if (isGeneratorOn)
                    {
                        area = HideoutController.updateFuel(area, solarPowerLevel);
                    }
                    break;

                case areaTypes.WATER_COLLECTOR:
                    if (area.level === 3)
                    {
                        const prod = pmcData.Hideout.Production[WATER_COLLECTOR];
                        if (prod)
                        {
                            area = HideoutController.updateWaterFilters(area, prod, isGeneratorOn);
                        }
                        else
                        {
                            // continuousProductionStart()
                            // seem to not trigger consistently
                            const recipe = { "recipeId": WATER_COLLECTOR };
                            HideoutController.registerProduction(pmcData, recipe, sessionID);
                        }

                        for (const slot of area.slots)
                        {
                            if (slot.item)
                            {
                                WaterCollectorHasFilter = true;
                                break;
                            }
                        }
                    }
                    break;

                case areaTypes.AIR_FILTERING:
                    if (isGeneratorOn)
                    {
                        area = HideoutController.updateAirFilters(area);
                    }
                    break;

                case areaTypes.BITCOIN_FARM:
                    for (const slot of area.slots)
                    {
                        if (slot.item)
                        {
                            btcFarmCGs++;
                        }
                    }
                    break;
            }
        }

        // update production time
        for (const prod in pmcData.Hideout.Production)
        {
            const scavCaseRecipe = DatabaseServer.tables.hideout.scavcase.find(r => r._id === prod);
            if (!pmcData.Hideout.Production[prod].inProgress)
            {
                continue;
            }

            if (scavCaseRecipe)
            {
                const time_elapsed = (TimeUtil.getTimestamp() - pmcData.Hideout.Production[prod].StartTimestamp) - pmcData.Hideout.Production[prod].Progress;
                pmcData.Hideout.Production[prod].Progress += time_elapsed;
                continue;
            }

            if (prod === WATER_COLLECTOR)
            {
                let time_elapsed = (TimeUtil.getTimestamp() - pmcData.Hideout.Production[prod].StartTimestamp) - pmcData.Hideout.Production[prod].Progress;
                if (!isGeneratorOn)
                {
                    time_elapsed = Math.floor(time_elapsed * 0.2);
                }

                if (WaterCollectorHasFilter)
                {

                    pmcData.Hideout.Production[prod].Progress += time_elapsed;
                }
                continue;
            }

            if (prod === BITCOIN_FARM)
            {
                pmcData.Hideout.Production[prod] = HideoutController.updateBitcoinFarm(pmcData.Hideout.Production[prod], btcFarmCGs, isGeneratorOn);
                continue;
            }

            //other recipes
            const recipe = recipes.find(r => r._id === prod);
            if (!recipe)
            {
                Logger.error(`Could not find recipe ${prod} for area type ${recipes.areaType}`);
                continue;
            }

            let time_elapsed = (TimeUtil.getTimestamp() - pmcData.Hideout.Production[prod].StartTimestamp) - pmcData.Hideout.Production[prod].Progress;
            if (recipe.continuous && !isGeneratorOn)
            {
                time_elapsed = Math.floor(time_elapsed * 0.2);
            }
            pmcData.Hideout.Production[prod].Progress += time_elapsed;
        }
    }

    static updateFuel(generatorArea, solarPower)
    {
        // 1 resource last 14 min 27 sec, 1/14.45/60 = 0.00115
        let fuelDrainRate = 0.00115 * HideoutConfig.runInterval;
        fuelDrainRate = solarPower === 1 ? fuelDrainRate / 2 : fuelDrainRate;
        let hasAnyFuelRemaining = false;

        for (let i = 0; i < generatorArea.slots.length; i++)
        {
            if (!generatorArea.slots[i].item)
            {
                continue;
            }
            else
            {
                let resourceValue = (generatorArea.slots[i].item[0].upd && generatorArea.slots[i].item[0].upd.Resource)
                    ? generatorArea.slots[i].item[0].upd.Resource.Value
                    : null;
                if (resourceValue === 0)
                {
                    continue;
                }
                else if (!resourceValue)
                {
                    const fuelItem = "5d1b371186f774253763a656"; // Expeditionary fuel tank
                    resourceValue = generatorArea.slots[i].item[0]._tpl === fuelItem
                        ? resourceValue = 60 - fuelDrainRate
                        : resourceValue = 100 - fuelDrainRate;
                }
                else
                {
                    resourceValue -= fuelDrainRate;
                }
                resourceValue = Math.round(resourceValue * 10000) / 10000;

                if (resourceValue > 0)
                {
                    generatorArea.slots[i].item[0].upd = {
                        "StackObjectsCount": 1,
                        "Resource": {
                            "Value": resourceValue
                        }
                    };
                    console.log(`Generator: ${resourceValue} fuel left on tank slot ${i + 1}`);
                    hasAnyFuelRemaining = true;
                    break; // Break here to avoid updating all the fuel tanks
                }
                else
                {
                    generatorArea.slots[i].item[0].upd = {
                        "StackObjectsCount": 1,
                        "Resource": {
                            "Value": 0
                        }
                    };
                }
            }
        }

        if (!hasAnyFuelRemaining)
        {
            generatorArea.active = false;
        }

        return generatorArea;
    }

    static updateWaterFilters(waterFilterArea, pwProd, isGeneratorOn)
    {
        let time_elapsed = (TimeUtil.getTimestamp() - pwProd.StartTimestamp) - pwProd.Progress;
        // 100 resources last 8 hrs 20 min, 100/8.33/60/60 = 0.00333
        let filterDrainRate = 0.00333;
        let production_time = 0;

        const recipes = DatabaseServer.tables.hideout.production;
        for (const prod of recipes)
        {
            if (prod._id === WATER_COLLECTOR)
            {
                production_time = prod.productionTime;
                break;
            }
        }

        if (pwProd.Progress < production_time)
        {
            for (let i = 0; i < waterFilterArea.slots.length; i++)
            {
                if (!waterFilterArea.slots[i].item)
                {
                    continue;
                }
                else
                {
                    if (!isGeneratorOn)
                    {
                        time_elapsed = Math.floor(time_elapsed * 0.2);
                    }
                    filterDrainRate = (time_elapsed > production_time)
                        ? filterDrainRate *= (production_time - pwProd.Progress)
                        : filterDrainRate *= time_elapsed;

                    let resourceValue = (waterFilterArea.slots[i].item[0].upd && waterFilterArea.slots[i].item[0].upd.Resource)
                        ? waterFilterArea.slots[i].item[0].upd.Resource.Value
                        : null;
                    if (!resourceValue)
                    {
                        resourceValue = 100 - filterDrainRate;
                    }
                    else
                    {
                        resourceValue -= filterDrainRate;
                    }
                    resourceValue = Math.round(resourceValue * 10000) / 10000;

                    if (resourceValue > 0)
                    {
                        waterFilterArea.slots[i].item[0].upd = {
                            "StackObjectsCount": 1,
                            "Resource": {
                                "Value": resourceValue
                            }
                        };
                        console.log(`Water filter: ${resourceValue} filter left on slot ${i + 1}`);
                        break; // Break here to avoid updating all filters
                    }
                    else
                    {
                        waterFilterArea.slots[i].item = null;
                    }
                }
            }
        }

        return waterFilterArea;
    }

    static updateAirFilters(airFilterArea)
    {
        // 300 resources last 20 hrs, 300/20/60/60 = 0.00416
        const filterDrainRate = 0.00416 * HideoutConfig.runInterval;

        for (let i = 0; i < airFilterArea.slots.length; i++)
        {
            if (!airFilterArea.slots[i].item)
            {
                continue;
            }
            else
            {
                let resourceValue = (airFilterArea.slots[i].item[0].upd && airFilterArea.slots[i].item[0].upd.Resource)
                    ? airFilterArea.slots[i].item[0].upd.Resource.Value
                    : null;
                if (!resourceValue)
                {
                    resourceValue = 300 - filterDrainRate;
                }
                else
                {
                    resourceValue -= filterDrainRate;
                }
                resourceValue = Math.round(resourceValue * 10000) / 10000;

                if (resourceValue > 0)
                {
                    airFilterArea.slots[i].item[0].upd = {
                        "StackObjectsCount": 1,
                        "Resource": {
                            "Value": resourceValue
                        }
                    };
                    console.log(`Air filter: ${resourceValue} filter left on slot ${i + 1}`);
                    break; // Break here to avoid updating all filters
                }
                else
                {
                    airFilterArea.slots[i].item = null;
                }
            }
        }

        return airFilterArea;
    }

    static updateBitcoinFarm(btcProd, btcFarmCGs, isGeneratorOn)
    {
        const time_elapsed = 4 * (TimeUtil.getTimestamp() - btcProd.StartTimestamp);

        if (isGeneratorOn)
        {
            btcProd.Progress += time_elapsed;
        }

        // Function to reduce production time based on amount of GPU's
        // Client sees 72000 Progress as a bitcoin
        // This need to be updated to be accurate under 50 CGs
        const btcFormula = (0.05 + (btcFarmCGs - 1) / 49 * 0.15);
        const t2 = Math.pow(btcFormula, -1);
        const final_prodtime = Math.floor(t2 * 14400);

        while (btcProd.Progress > final_prodtime)
        {
            if (btcProd.Products.length < 5)
            {
                btcProd.Products.push({
                    "_id": HashUtil.generate(),
                    "_tpl": "59faff1d86f7746c51718c9c",
                    "upd": {
                        "StackObjectsCount": 1
                    }
                });
                btcProd.Progress -= final_prodtime;
            }
            else
            {
                btcProd.Progress = 0;
            }
        }

        btcProd.StartTimestamp = TimeUtil.getTimestamp();
        return btcProd;
    }
}

module.exports = HideoutController;

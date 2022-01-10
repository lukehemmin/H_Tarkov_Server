"use strict";

require("../Lib.js");

class DurabilityLimitsHelper
{
    static getRandomisedMaxWeaponDurability(itemTemplate, botRole)
    {
        if (botRole && BotController.isBotPmc(botRole))
        {
            return itemTemplate._props.MaxDurability;
        }

        if (botRole && BotController.isBotBoss(botRole))
        {
            return RandomUtil.getInt(itemTemplate._props.durabSpawnMax, itemTemplate._props.MaxDurability);
        }

        return RandomUtil.getInt(itemTemplate._props.durabSpawnMin, itemTemplate._props.durabSpawnMax);
    }

    /**  Different rules for PMCs / Bosses vs other bots
    *    PMCs cant have their weapon durability be below 80% of max
    *    Bosses cant have their armor durability be below 50% of max
    *    Other bots go full length of durability scale
    */
    static getRandomisedWeaponDurability(itemTemplate, botRole, maxDurability)
    {
        if (botRole && (BotController.isBotPmc(botRole)))
        {
            // e.g. min: 100(max) * 0.8(min) = 80
            return RandomUtil.getInt((maxDurability * DurabilityLimitsHelper.getMinPmcWeaponDurabilityFromConfig()), maxDurability);
        }

        if (botRole && BotController.isBotBoss(botRole))
        {
            // ensure min isnt above max
            const configMin = maxDurability * DurabilityLimitsHelper.getMinBossWeaponDurabilityFromConfig();
            const minDurability = configMin > maxDurability ? maxDurability : configMin;
            return RandomUtil.getInt(minDurability, maxDurability);
        }

        return RandomUtil.getInt(itemTemplate._props.durabSpawnMin, maxDurability);
    }

    /**  Different rules for PMCs / Bosses vs other bots
    *    PMCs cant have their armor durability be below 80% of max
    *    Bosses cant have their armor durability be below 50% of max
    *    Other bots go full length of durability scale
    */
    static getRandomisedArmorDurability(itemTemplate, botRole, maxDurability)
    {
        if (botRole && (BotController.isBotPmc(botRole) || BotController.isBotBoss(botRole)))
        {
            // e.g. min: 100(max) * 0.8(min) = 80
            return RandomUtil.getInt((maxDurability * DurabilityLimitsHelper.getMinPmcArmorDurabilityFromConfig()), maxDurability);
        }

        if (botRole && BotController.isBotBoss(botRole))
        {
            return RandomUtil.getInt(maxDurability * DurabilityLimitsHelper.getMinBossArmorDurabilityFromConfig(), maxDurability);
        }

        return RandomUtil.getIntEx(maxDurability);
    }

    /** Convert from percent to decimal */
    static getMinPmcWeaponDurabilityFromConfig()
    {
        return BotConfig.durability.pmc.weapon.minPercent / 100;
    }

    /** Convert from percent to decimal */
    static getMinBossWeaponDurabilityFromConfig()
    {
        return BotConfig.durability.boss.weapon.minPercent / 100;
    }

    /** Convert from percent to decimal */
    static getMinPmcArmorDurabilityFromConfig()
    {
        return BotConfig.durability.pmc.armor.minPercent / 100;
    }

    /** Convert from percent to decimal */
    static getMinBossArmorDurabilityFromConfig()
    {
        return BotConfig.durability.boss.armor.minPercent / 100;
    }
}

module.exports = DurabilityLimitsHelper;
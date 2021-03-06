import { MODULE } from "../data/moduleConstants.js";
import { ChatHelper } from "./ChatHelper.js";
import { CurrencyHelper } from "./currencyHelper.js";
import { ItemHelper } from "./ItemHelper.js";
import { PermissionHelper } from "./PermissionHelper.js";

/**
 * @Module LootsheetNPC5e.Helpers.TradeHelper
 * @name TradeHelper
 *
 * @classdec Static helper methods for trading
 *
 * @since 3.4.5.3
 * @author Daniel Böttner <daniel@est-in.eu>
 * @license MIT
 */
export class TradeHelper {

    /**
     * @summary Handle the trade between two actors
     *
     * @description This method handles the trade between two actors.
     *
     * It is called by the trade button on the loot sheet.
     * - in the future may -> It is also called by the trade button on the item sheet.
     * - in the future may -> It is also called by the trade button on the character sheet.
     *
     * @param {Actor} npcActor The NPC Actor that is trading with the player
     * @param {Actor} playerCharacter The Player Character that is trading with the NPC
     * @param {Array} trades The trades that are to be executed
     * @param {object} options The options for the trade
     *
     * @returns {Promise<boolean>}
     */
    static async tradeItems(npcActor, playerCharacter, trades, options = {}) {
        options.priceModifier = parseFloat(npcActor.getFlag(MODULE.ns, MODULE.flags.priceModifier)).toPrecision(2) || 1;

        // for tradeType in object trades get the array
        for (let type in trades) {
            if (!trades[type].length > 0) continue;
            options.type = type;
            this._handleTradyByType(trades, playerCharacter, npcActor, options);
        }
    }

    /**
     * @summary loot items from one actor to another
     *
     * @description Move items from one actor to another
     * Assumes that the set of items is valid and can be moved.
     *
     * @param {Token} source
     * @param {Actor5e} destination
     * @param {Array<Item>} items
     *
     * @returns {Promise<Array<Item>>}
     * @inheritdoc
     */
    static async lootItems(source, destination, items) {
        let movedItems = await ItemHelper.moveItemsToDestination(source.actor, destination, items);

        if (ChatHelper.chatMessage(source, destination, movedItems, { type: 'loot' }))
            return true;

        return false;
    }

    /**
     * @summary -- 👽☠️🏴‍☠️All ya Items belong to us 🏴‍☠️☠️👽  --
     *
     * @description Gets the lootable subset of the items in
     * the source actor and moves this subset to the destination actor.
     *
     * @param {Token} source
     * @param {Actor} destination
     *
     * @returns {Promise<Array<Item>>}
     *
     * @function
     *
     * @since 3.4.5.3
     * @author Daniel Böttner <daniel@est-in.eu>
     */
    static async lootAllItems(source, destination, options = {}) {
        const items = ItemHelper.getLootableItems(source.actor.items).map((item) => ({
            id: item.id,
            data: {
                data: {
                    quantity: item.data.data.quantity
                }
            }
        }));

        this.lootItems(source, destination, items);
        this.lootCurrency(source, destination);
    }

    /**
     * Handle a buy transaction between a seller & a buyer
     *
     * @description
     * #### This could likely be refactored or scrubbed.
     * See [tradeItems](#tradeItems) for the more generic version.
     *
     * - First the buy item button in the inventory needs to be refactored.
     * - - The buttons action needs to be changed to tradeItems
     * - - The buttons class so it gets picket up by the actionButtons selector (eventListener)
     * - The items need to be parsed to resemble the item structure of items in the trade stage
     * - - see [_handleTradeStage](LootSheetNPC5e.Helpers.LootSheetNPC5eHelper._handleTradeStage) for more details
     * - - Maybe by making each html row(~item) a stage.
     *
     * @todo Refactor and make obsolete
     *
     * @see this.tradeItems for the more generic version
     * @see LootSheetNPC5e.Helpers.LootSheetNPC5eHelper._handleTradeStage for the stage handling
     *
     * @param {Actor} seller
     * @param {Actor} buyer
     * @param {string} itemId
     * @param {number} quantity
     * @param {object} options
     *
     * @returns {Promise<boolean>}
     *
     * @author Jan Ole Peek <@jopeek>
     *
     * @since 1.0.0
     *
     * @inheritdoc
     */
    static async transaction(seller, buyer, itemId, quantity, options = { chatOutPut: true }) {
        // On 0 quantity skip everything to avoid error down the line
        if (quantity == 0) return ItemHelper.errorMessageToActor(buyer, `Not enought items on vendor.`);

        const soldItem = seller.getEmbeddedDocument("Item", itemId),
            priceModifier = parseFloat(seller.getFlag(MODULE.ns, MODULE.flags.priceModifier)) || 1;

        let moved = false;
        quantity = (soldItem.data.data.quantity < quantity) ? parseInt(soldItem.data.data.quantity) : parseInt(quantity);

        let itemCostInGold = (Math.round(soldItem.data.data.price * priceModifier * 100) / 100) * quantity,
            successfullTransaction = await this._updateFunds(seller, buyer, itemCostInGold);
        if (!successfullTransaction) return false;
        moved = await ItemHelper.moveItemsToDestination(seller, buyer, [{ id: itemId, data: { data: { quantity: quantity } } }]);

        if (moved || options?.chatOutPut) return ChatHelper.chatMessage(seller, buyer, moved, { type: 'buy', priceModifier: priceModifier });
    }

    /**
     * @summary  (🧑‍🎤🪙 ➗ 👥) - (🧑‍🎤🪙) -> 💰 -> 👥🪙 + 💰
     *
     * @description Split the currency of an actor between multiple eligable player actors
     *
     * @param {Actor} actor
     * @param {options} options
     *
     * @returns {Promise<boolean>}
     */
    static distributeCurrency(actor, options = { verbose: true }) {
        const actorData = actor.data,
            eligables = PermissionHelper.getEligablePlayerActors(actor),
            currency = CurrencyHelper.handleActorCurrency(actorData.data.currency),
            [currencyShares, npcRemainingCurrency] = CurrencyHelper.getSharesAndRemainder(currency, eligables.length);

        let msg = [];

        if (options.verbose) {
            let cmsg = `${MODULE.ns} | ${distributeCoins.name}|`;
            console.log(cmsg + ' actorData:', actorData);
            console.log(cmsg + ' players:', game.users.players);
            console.log(cmsg + ' observers:', eligables);
            console.log(cmsg + ' currencyShares:', currencyShares);
            console.log(cmsg + ' npcRemainingCurrency', npcRemainingCurrency);
        }

        if (eligables.length === 0) return;

        for (let player of game.users.players) {
            let playerCharacter = player.character;
            if (playerCharacter === null) continue;
            if (!eligables.includes(playerCharacter.id)) continue;

            msg = [];
            let playerCurrency = duplicate(playerCharacter.data.data.currency),
                newCurrency = duplicate(playerCharacter.data.data.currency);

            for (let c in playerCurrency) {
                if (currencyShares[c]) {
                    msg.push(`${playerCharacter.data.name} receives:${currencyShares[c]} ${c} coins.`)
                }
                newCurrency[c] = parseInt(playerCurrency[c] || 0) + currencyShares[c];
                playerCharacter.update({
                    'data.currency': newCurrency
                });
            }
        }

        actor.update({
            "data.currency": npcRemainingCurrency
        });


        // Create chat message for coins received
        let message = `The  ${currencyShares.join(', ')} coins of ${actor.name} where shared between ${eligables.length} creatures.`;
        if (msg.length > 0)
            message += msg.join(",");


        ChatMessage.create({
            user: game.user.id,
            speaker: {
                actor: actor,
                alias: actor.name
            },
            content: message
        });
    }

    /**
     * @summary #### loot funds from an actor to another
     * @example 🧑‍🎤 -> 💰 -> 🧑‍🎤
     *
     * @description move the funds from one actor to another
     *
     * @todo maybe refactor to use the Currencyhelper and the ChatHelper
     *
     * @param {Actor5e} source
     * @param {User} destination
     *
     * @returns {Promise<boolean>}
     * @author Jan Ole Peek <@jopeek>
     *
     * @since 1.0.0
     * @inheritdoc
     */
    static async lootCurrency(source, destination) {
        const actorData = source.data;
        let sheetCurrency = duplicate(actorData.data.currency);
        let msg = [];
        let currency = duplicate(destination.data.data.currency),
            newCurrency = duplicate(destination.data.data.currency);

        for (let c in currency) {
            if (sheetCurrency[c]) {
                msg.push(` ${sheetCurrency[c]} ${c} coins`)
            }
            if (sheetCurrency[c] != null) {
                newCurrency[c] = parseInt(currency[c] || 0) + parseInt(sheetCurrency[c]);
                destination.update({
                    'data.currency': newCurrency
                });
            }
        }

        // Remove currency from loot actor.
        let lootCurrency = duplicate(source.data.data.currency),
            zeroCurrency = {};

        for (let c in lootCurrency) {
            zeroCurrency[c] = 0;
            source.update({
                "data.currency": zeroCurrency
            });
        }

        /**
         * Could likely be handled by the ChatHelper.chatMessage function
         */
        // Create chat message for coins received
        if (msg.length != 0) {
            let message = `${destination.data.name} receives: `;
            message += msg.join(",");
            ChatMessage.create({
                user: game.user._id,
                speaker: {
                    actor: source,
                    alias: source.name
                },
                content: message,
                flags: {
                    lootsheetnpc5e: {
                        type: 'loot',
                        lootedCurrency: lootCurrency
                    }
                }
            });
        }
    }

    /**
     * @summary Handle a trade by its type
     * @description
     *
     * | Currently supported types |
     * | ---  | --- |
     * | buy  | Player actor buys from a NPC |
     * | sell | Player actor sells to NPC |
     * | loot | Player Actor loots from the NPC |
     * | --- | --- |
     *
     * @param {Array} trades
     * @param {Actor} playerCharacter
     * @param {Actor} npcActor
     * @param {object} options
     *
     * @returns {Promise<boolean>}
     *
     * @function
     * @inheritdoc
     * @since 3.4.5.3
     * @author Daniel Böttner <@DanielBoettner>
     *
     */
    static async _handleTradyByType(trades, playerCharacter, npcActor, options) {
        const tradeType = options.type,
            source = tradeType === 'sell' ? playerCharacter.items : npcActor.items,
            freeTradeTypes = ['loot'];
        let moved = { sell: [], buy: [] },
            tradeSum = 0,
            successfullTransaction = freeTradeTypes.includes(tradeType) ? true : false,
            items = trades[tradeType];

        options.verbose = true;
        const verboseMsg = `${MODULE.ns} | ${this._handleTradyByType.name} | `;

            // iterate over part of the trades array with key of options.type
        [items, tradeSum] = this._prepareTrade(source, items, tradeSum, options)

        /**
         * @description
         * If buy or sell, check if the target has enough funds to buy the items
         * needs a check if NPC actor always have enough funds to buy from the player.
         * Would be the case if it represents a shop or a bank.
         *
         * Otherwise the GM always has to make sure thats the case. A simple checkbox would be better.
         *
         */

        switch (tradeType) {
            case 'buy':
                successfullTransaction = await this._updateFunds(npcActor, playerCharacter, tradeSum);
                if (options?.verbose) console.log(`${verboseMsg} Transaction successfull: ${successfullTransaction}`);
                if (!successfullTransaction) return false;
                moved[options.type] = await ItemHelper.moveItemsToDestination(npcActor, playerCharacter, items);
                break;
            case 'sell':
                successfullTransaction = await this._updateFunds(playerCharacter, npcActor, tradeSum);
                if (options?.verbose) console.log(`${verboseMsg} Transaction successfull: ${successfullTransaction}`);
                if (!successfullTransaction) return false;
                moved[options.type] = await ItemHelper.moveItemsToDestination(playerCharacter, npcActor, items);
                break;
            case 'loot':
                if (!successfullTransaction) return false;
                moved[options.type] = await ItemHelper.moveItemsToDestination(npcActor, playerCharacter, items);
                break;
            default:
                console.error(`${verboseMsg} Unknown type: ${tradeType}`);
        }

        // if the chatOutPut flag is set, send the chat messages
        if (!options.chatOutPut) return;
        ChatHelper.chatMessage(npcActor, playerCharacter, moved[options.type], { type: options.type, priceModifier: options.priceModifier });

        return true;
    }

    /**
     *
     * @description
     * Check again if the source posses the item
     * If the source is not in possesion of the item anymore, remove it from the items array.
     *
     * If the source is in possesion add its worth to the total tradesum.
     *
     * @param {Actor} source
     * @param {Collection} items
     * @param {number} tradeSum
     * @param {object} options
     *
     * @returns {Array} [items, tradeSum]
     */
    static _prepareTrade(source, items, tradeSum = 0, options = {}) {
        for (const [key, item] of items.entries()) {
            if (!source.find(i => i.id == item.id)) {
                if (options?.verbose)
                    console.log(`${MODULE.ns} | ${this._prepareTrade.name} | Removed item "${item.name}" (id: ${item.id}) from trade. Item not found in inventory of the source actor.`);
                delete items[key];
                continue;
            }
            // Add item price to the total sum of the trade
            tradeSum += (Math.round(item.data.data.price * options.priceModifier * 100) / 100) * item.data.data.quantity;
            if (options?.verbose) console.log(`${MODULE.ns} | ${this._prepareTrade.name} | tradeSum updated to: `);
        }

        return [items, tradeSum];
    }

    /**
     * @summary Check the buyers funds and transfer the funds if they are enough
     *
     * @param {Actor5e} seller
     * @param {Actor5e} buyer
     * @param {number} itemCostInGold
     *
     * @returns {boolean}
     *
     * @author Jan Ole Peek @jopeek
     */
    static async _updateFunds(seller, buyer, itemCostInGold) {
        //console.log(`ItemCost: ${itemCostInGold}`)
        let buyerFunds = duplicate(buyer.data.data.currency),
            sellerFunds = duplicate(seller.data.data.currency);

        const compensationCurrency = { "pp": "gp", "gp": "ep", "ep": "sp", "sp": "cp" },
            convertCurrency = game.settings.get(MODULE.ns, "convertCurrency"),
            rates = {
                "pp": 1,
                "gp": CONFIG.DND5E.currencies.gp.conversion.each,
                "ep": CONFIG.DND5E.currencies.ep.conversion.each,
                "sp": CONFIG.DND5E.currencies.sp.conversion.each,
                "cp": CONFIG.DND5E.currencies.cp.conversion.each
            },
            itemCostInPlatinum = itemCostInGold / rates["gp"];

        let buyerFundsAsPlatinum = buyerFunds["pp"];

        buyerFundsAsPlatinum += buyerFunds["gp"] / rates["gp"];
        buyerFundsAsPlatinum += buyerFunds["ep"] / rates["gp"] / rates["ep"];
        buyerFundsAsPlatinum += buyerFunds["sp"] / rates["gp"] / rates["ep"] / rates["sp"];
        buyerFundsAsPlatinum += buyerFunds["cp"] / rates["gp"] / rates["ep"] / rates["sp"] / rates["cp"];

        // console.log(`buyerFundsAsPlatinum : ${buyerFundsAsPlatinum}`);

        if (itemCostInPlatinum > buyerFundsAsPlatinum) {
            ItemHelper.errorMessageToActor(buyer, buyer.name + ` doesn't have enough funds to purchase an item for ${itemCostInGold}gp.`);
            return false;
        }

        if (convertCurrency) {
            buyerFundsAsPlatinum -= itemCostInPlatinum;

            for (let currency in buyerFunds) {
                buyerFunds[currency] = 0; // Remove every coin we have
            }
            buyerFunds["pp"] = buyerFundsAsPlatinum

        } else {
            // We just pay in partial platinum.
            buyerFunds["pp"] -= itemCostInPlatinum
            // Now we exchange all negative funds with coins of lower value

            for (let currency in buyerFunds) {
                let amount = buyerFunds[currency]
                // console.log(`${currency} : ${amount}`);
                if (amount >= 0) continue;

                // If we have ever so slightly negative cp, it is likely due to floating point error
                // We dont care and just give it to the player
                if (currency == "cp") {
                    buyerFunds["cp"] = 0;
                    continue;
                }

                let compCurrency = compensationCurrency[currency]

                buyerFunds[currency] = 0;
                buyerFunds[compCurrency] += amount * rates[compCurrency]; // amount is a negative value so we add it
                // console.log(`Substracted: ${amount * conversionRates[compCurrency]} ${compCurrency}`);
            }
        }

        // console.log(`Smoothing out`);
        // Finally we exchange partial coins with as little change as possible
        for (let currency in buyerFunds) {
            let amount = buyerFunds[currency]

            //console.log(`${currency} : ${amount}: ${conversionRates[currency]}`);

            // We round to 5 decimals. 1 pp is 1000cp, so 5 decimals always rounds good enough
            // We need to round because otherwise we get 15.99999999999918 instead of 16 due to floating point precision
            // If we would floor 15.99999999999918 everything explodes
            let newFund = Math.floor(Math.round(amount * 1e5) / 1e5);
            buyerFunds[currency] = newFund;

            //console.log(`New Buyer funds ${currency}: ${buyerFunds[currency]}`);
            let compCurrency = compensationCurrency[currency]

            if (currency != "cp") {
                // We calculate the amount of lower currency we get for the fraction of higher currency we have
                let toAdd = Math.round((amount - newFund) * 1e5) / 1e5 * rates[compCurrency]
                buyerFunds[compCurrency] += toAdd
                //console.log(`Added ${toAdd} to ${compCurrency} it is now ${buyerFunds[compCurrency]}`);
            }
        }

        sellerFunds.gp += itemCostInGold;

        await seller.update({ data: { currency: sellerFunds } });
        await buyer.update({ data: { currency: buyerFunds } });

        return true;
    }
}

import { PriceModifierDialog } from "../apps/sheets/PriceModifierDialog.js";
import { MODULE } from "../data/moduleConstants.js";

export class sheetHelper {

    /**
     * Handle price modifier
     *
     * @param {Event} event
     * @param {Actor} actor
     *
     */
    static async renderPriceModifierDialog(event, actor) {
        event.preventDefault();

        const maxModifier = game.settings.get(MODULE.ns, "maxPriceIncrease");
        let priceModifier = await actor.getFlag(MODULE.ns, "priceModifier");

        priceModifier = (typeof priceModifier !== 'number') ? 1 : priceModifier;
        priceModifier = Math.round(priceModifier * 100);

        const d = new PriceModifierDialog(
            {
                actor: actor,
                currentModifier: priceModifier,
                maxModifier: maxModifier
            });

        d.render(true);
    }

    getData(options){
        return options;
    }

    /**
     *
     * @param {event} event
     */
    static toggleHelp(event){
        event.currentTarget.nextElementSibling.classList.toggle('hidden');
    }

}
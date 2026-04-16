class HAToolsStack extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._cards = [];
    this._config = null;
    this._hass = null;
    this._initialized = false;
  }

  setConfig(config) {
    this._config = config;
    if (!config.cards || !config.cards.length) {
      throw new Error('No cards configured');
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized && this._config) {
      this._initialized = true;
      this._buildCards();
    } else {
      this._cards.forEach(c => { if (c) c.hass = hass; });
    }
  }

  async _buildCards() {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding:16px;';
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(container);

    for (let i = 0; i < this._config.cards.length; i++) {
      const cardConfig = this._config.cards[i];
      try {
        const tag = cardConfig.type.startsWith('custom:')
          ? cardConfig.type.substring(7)
          : `hui-${cardConfig.type}-card`;

        // Wait for custom element to be defined
        if (!customElements.get(tag)) {
          await Promise.race([
            customElements.whenDefined(tag),
            new Promise(r => setTimeout(r, 5000))
          ]);
        }

        const el = document.createElement(tag);
        if (typeof el.setConfig === 'function') {
          el.setConfig(cardConfig);
        }

        el.hass = this._hass;
        el.style.cssText = 'display:block;width:100%;min-height:200px;';
        container.appendChild(el);
        this._cards.push(el);

        // Small delay between card initializations to avoid overwhelming the renderer
        await new Promise(r => setTimeout(r, 150));

      } catch (err) {
        console.error(`HAToolsStack: Failed to create card ${i} (${cardConfig.type}):`, err);
        const errDiv = document.createElement('div');
        errDiv.textContent = `Error loading: ${cardConfig.type}`;
        errDiv.style.cssText = 'color:red;padding:16px;border:1px solid red;border-radius:8px;';
        container.appendChild(errDiv);
      }
    }

    console.log(`HAToolsStack: Initialized ${this._cards.length} cards`);
  }

  getCardSize() {
    return this._config?.cards?.length * 5 || 1;
  }
}

customElements.define('ha-tools-stack', HAToolsStack);
console.log('ha-tools-stack custom element registered');

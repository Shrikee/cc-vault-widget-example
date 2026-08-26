import{n as l,c as p,a as y,r as u,i as $,o as w,b as c,d as he,U as ee,e as Gt,f as Kt,g as Ht}from"./index-CdkWfYvk.js";import{A as lt,i as C,e as D,r as O,a as W,b as d,C as x,c as m,O as M,d as h,E as V,R as I,f as Re,g as z,h as g,S as Qe,j as Ft,W as Ye,k as ct,l as Rt,T as dt,m as ze,M as kt,n as Lt,w as We,o as Xt}from"./core-fSHA0rPV.js";import{ac as Qt}from"./index-D6OIT761.js";import"./index.es-B-ua_Xua.js";/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function zt(a){return l({...a,state:!0,attribute:!1})}/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const te=a=>a??lt,Yt=C`
  :host {
    position: relative;
    background-color: var(--wui-color-gray-glass-002);
    display: flex;
    justify-content: center;
    align-items: center;
    width: var(--local-size);
    height: var(--local-size);
    border-radius: inherit;
    border-radius: var(--local-border-radius);
  }

  :host > wui-flex {
    overflow: hidden;
    border-radius: inherit;
    border-radius: var(--local-border-radius);
  }

  :host::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: inherit;
    border: 1px solid var(--wui-color-gray-glass-010);
    pointer-events: none;
  }

  :host([name='Extension'])::after {
    border: 1px solid var(--wui-color-accent-glass-010);
  }

  :host([data-wallet-icon='allWallets']) {
    background-color: var(--wui-all-wallets-bg-100);
  }

  :host([data-wallet-icon='allWallets'])::after {
    border: 1px solid var(--wui-color-accent-glass-010);
  }

  wui-icon[data-parent-size='inherit'] {
    width: 75%;
    height: 75%;
    align-items: center;
  }

  wui-icon[data-parent-size='sm'] {
    width: 18px;
    height: 18px;
  }

  wui-icon[data-parent-size='md'] {
    width: 24px;
    height: 24px;
  }

  wui-icon[data-parent-size='lg'] {
    width: 42px;
    height: 42px;
  }

  wui-icon[data-parent-size='full'] {
    width: 100%;
    height: 100%;
  }

  :host > wui-icon-box {
    position: absolute;
    overflow: hidden;
    right: -1px;
    bottom: -2px;
    z-index: 1;
    border: 2px solid var(--wui-color-bg-150, #1e1f1f);
    padding: 1px;
  }
`;var we=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ie=class extends W{constructor(){super(...arguments),this.size="md",this.name="",this.installed=!1,this.badgeSize="xs"}render(){let e="xxs";return this.size==="lg"?e="m":this.size==="md"?e="xs":e="xxs",this.style.cssText=`
       --local-border-radius: var(--wui-border-radius-${e});
       --local-size: var(--wui-wallet-image-size-${this.size});
   `,this.walletIcon&&(this.dataset.walletIcon=this.walletIcon),d`
      <wui-flex justifyContent="center" alignItems="center"> ${this.templateVisual()} </wui-flex>
    `}templateVisual(){return this.imageSrc?d`<wui-image src=${this.imageSrc} alt=${this.name}></wui-image>`:this.walletIcon?d`<wui-icon
        data-parent-size="md"
        size="md"
        color="inherit"
        name=${this.walletIcon}
      ></wui-icon>`:d`<wui-icon
      data-parent-size=${this.size}
      size="inherit"
      color="inherit"
      name="walletPlaceholder"
    ></wui-icon>`}};ie.styles=[D,O,Yt];we([l()],ie.prototype,"size",void 0);we([l()],ie.prototype,"name",void 0);we([l()],ie.prototype,"imageSrc",void 0);we([l()],ie.prototype,"walletIcon",void 0);we([l({type:Boolean})],ie.prototype,"installed",void 0);we([l()],ie.prototype,"badgeSize",void 0);ie=we([p("wui-wallet-image")],ie);const Zt=C`
  :host {
    position: relative;
    border-radius: var(--wui-border-radius-xxs);
    width: 40px;
    height: 40px;
    overflow: hidden;
    background: var(--wui-color-gray-glass-002);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--wui-spacing-4xs);
    padding: 3.75px !important;
  }

  :host::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: inherit;
    border: 1px solid var(--wui-color-gray-glass-010);
    pointer-events: none;
  }

  :host > wui-wallet-image {
    width: 14px;
    height: 14px;
    border-radius: var(--wui-border-radius-5xs);
  }

  :host > wui-flex {
    padding: 2px;
    position: fixed;
    overflow: hidden;
    left: 34px;
    bottom: 8px;
    background: var(--dark-background-150, #1e1f1f);
    border-radius: 50%;
    z-index: 2;
    display: flex;
  }
`;var Pt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};const rt=4;let Pe=class extends W{constructor(){super(...arguments),this.walletImages=[]}render(){const e=this.walletImages.length<rt;return d`${this.walletImages.slice(0,rt).map(({src:i,walletName:n})=>d`
            <wui-wallet-image
              size="inherit"
              imageSrc=${i}
              name=${te(n)}
            ></wui-wallet-image>
          `)}
      ${e?[...Array(rt-this.walletImages.length)].map(()=>d` <wui-wallet-image size="inherit" name=""></wui-wallet-image>`):null}
      <wui-flex>
        <wui-icon-box
          size="xxs"
          iconSize="xxs"
          iconcolor="success-100"
          backgroundcolor="success-100"
          icon="checkmark"
          background="opaque"
        ></wui-icon-box>
      </wui-flex>`}};Pe.styles=[O,Zt];Pt([l({type:Array})],Pe.prototype,"walletImages",void 0);Pe=Pt([p("wui-all-wallets-image")],Pe);const Jt=C`
  button {
    column-gap: var(--wui-spacing-s);
    padding: 7px var(--wui-spacing-l) 7px var(--wui-spacing-xs);
    width: 100%;
    background-color: var(--wui-color-gray-glass-002);
    border-radius: var(--wui-border-radius-xs);
    color: var(--wui-color-fg-100);
  }

  button > wui-text:nth-child(2) {
    display: flex;
    flex: 1;
  }

  button:disabled {
    background-color: var(--wui-color-gray-glass-015);
    color: var(--wui-color-gray-glass-015);
  }

  button:disabled > wui-tag {
    background-color: var(--wui-color-gray-glass-010);
    color: var(--wui-color-fg-300);
  }

  wui-icon {
    color: var(--wui-color-fg-200) !important;
  }
`;var A=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let T=class extends W{constructor(){super(...arguments),this.walletImages=[],this.imageSrc="",this.name="",this.tabIdx=void 0,this.installed=!1,this.disabled=!1,this.showAllWallets=!1,this.loading=!1,this.loadingSpinnerColor="accent-100"}render(){return d`
      <button ?disabled=${this.disabled} tabindex=${te(this.tabIdx)}>
        ${this.templateAllWallets()} ${this.templateWalletImage()}
        <wui-text variant="paragraph-500" color="inherit">${this.name}</wui-text>
        ${this.templateStatus()}
      </button>
    `}templateAllWallets(){return this.showAllWallets&&this.imageSrc?d` <wui-all-wallets-image .imageeSrc=${this.imageSrc}> </wui-all-wallets-image> `:this.showAllWallets&&this.walletIcon?d` <wui-wallet-image .walletIcon=${this.walletIcon} size="sm"> </wui-wallet-image> `:null}templateWalletImage(){return!this.showAllWallets&&this.imageSrc?d`<wui-wallet-image
        size="sm"
        imageSrc=${this.imageSrc}
        name=${this.name}
        .installed=${this.installed}
      ></wui-wallet-image>`:!this.showAllWallets&&!this.imageSrc?d`<wui-wallet-image size="sm" name=${this.name}></wui-wallet-image>`:null}templateStatus(){return this.loading?d`<wui-loading-spinner
        size="lg"
        color=${this.loadingSpinnerColor}
      ></wui-loading-spinner>`:this.tagLabel&&this.tagVariant?d`<wui-tag variant=${this.tagVariant}>${this.tagLabel}</wui-tag>`:this.icon?d`<wui-icon color="inherit" size="sm" name=${this.icon}></wui-icon>`:null}};T.styles=[O,D,Jt];A([l({type:Array})],T.prototype,"walletImages",void 0);A([l()],T.prototype,"imageSrc",void 0);A([l()],T.prototype,"name",void 0);A([l()],T.prototype,"tagLabel",void 0);A([l()],T.prototype,"tagVariant",void 0);A([l()],T.prototype,"icon",void 0);A([l()],T.prototype,"walletIcon",void 0);A([l()],T.prototype,"tabIdx",void 0);A([l({type:Boolean})],T.prototype,"installed",void 0);A([l({type:Boolean})],T.prototype,"disabled",void 0);A([l({type:Boolean})],T.prototype,"showAllWallets",void 0);A([l({type:Boolean})],T.prototype,"loading",void 0);A([l({type:String})],T.prototype,"loadingSpinnerColor",void 0);T=A([p("wui-list-wallet")],T);var xe=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let le=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.count=m.state.count,this.filteredCount=m.state.filteredWallets.length,this.isFetchingRecommendedWallets=m.state.isFetchingRecommendedWallets,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e),m.subscribeKey("count",e=>this.count=e),m.subscribeKey("filteredWallets",e=>this.filteredCount=e.length),m.subscribeKey("isFetchingRecommendedWallets",e=>this.isFetchingRecommendedWallets=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){const e=this.connectors.find(f=>f.id==="walletConnect"),{allWallets:i}=M.state;if(!e||i==="HIDE"||i==="ONLY_MOBILE"&&!h.isMobile())return null;const n=m.state.featured.length,o=this.count+n,t=o<10?o:Math.floor(o/10)*10,r=this.filteredCount>0?this.filteredCount:t;let s=`${r}`;return this.filteredCount>0?s=`${this.filteredCount}`:r<o&&(s=`${r}+`),c`
      <wui-list-wallet
        name="All Wallets"
        walletIcon="allWallets"
        showAllWallets
        @click=${this.onAllWallets.bind(this)}
        tagLabel=${s}
        tagVariant="shade"
        data-testid="all-wallets"
        tabIdx=${w(this.tabIdx)}
        .loading=${this.isFetchingRecommendedWallets}
        loadingSpinnerColor=${this.isFetchingRecommendedWallets?"fg-300":"accent-100"}
      ></wui-list-wallet>
    `}onAllWallets(){V.sendEvent({type:"track",event:"CLICK_ALL_WALLETS"}),I.push("AllWallets")}};xe([y()],le.prototype,"tabIdx",void 0);xe([u()],le.prototype,"connectors",void 0);xe([u()],le.prototype,"count",void 0);xe([u()],le.prototype,"filteredCount",void 0);xe([u()],le.prototype,"isFetchingRecommendedWallets",void 0);le=xe([p("w3m-all-wallets-widget")],le);var gt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let De=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){const e=this.connectors.filter(i=>i.type==="ANNOUNCED");return e!=null&&e.length?c`
      <wui-flex flexDirection="column" gap="xs">
        ${e.filter(Re.showConnector).map(i=>c`
              <wui-list-wallet
                imageSrc=${w(z.getConnectorImage(i))}
                name=${i.name??"Unknown"}
                @click=${()=>this.onConnector(i)}
                tagVariant="success"
                tagLabel="installed"
                data-testid=${`wallet-selector-${i.id}`}
                .installed=${!0}
                tabIdx=${w(this.tabIdx)}
              >
              </wui-list-wallet>
            `)}
      </wui-flex>
    `:(this.style.cssText="display: none",null)}onConnector(e){e.id==="walletConnect"?h.isMobile()?I.push("AllWallets"):I.push("ConnectingWalletConnect"):I.push("ConnectingExternal",{connector:e})}};gt([y()],De.prototype,"tabIdx",void 0);gt([u()],De.prototype,"connectors",void 0);De=gt([p("w3m-connect-announced-widget")],De);var Ze=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let _e=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.loading=!1,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e)),h.isTelegram()&&h.isIos()&&(this.loading=!g.state.wcUri,this.unsubscribe.push(g.subscribeKey("wcUri",e=>this.loading=!e)))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){const{customWallets:e}=M.state;if(!(e!=null&&e.length))return this.style.cssText="display: none",null;const i=this.filterOutDuplicateWallets(e);return c`<wui-flex flexDirection="column" gap="xs">
      ${i.map(n=>c`
          <wui-list-wallet
            imageSrc=${w(z.getWalletImage(n))}
            name=${n.name??"Unknown"}
            @click=${()=>this.onConnectWallet(n)}
            data-testid=${`wallet-selector-${n.id}`}
            tabIdx=${w(this.tabIdx)}
            ?loading=${this.loading}
          >
          </wui-list-wallet>
        `)}
    </wui-flex>`}filterOutDuplicateWallets(e){const i=Qe.getRecentWallets(),n=this.connectors.map(s=>{var f;return(f=s.info)==null?void 0:f.rdns}).filter(Boolean),o=i.map(s=>s.rdns).filter(Boolean),t=n.concat(o);if(t.includes("io.metamask.mobile")&&h.isMobile()){const s=t.indexOf("io.metamask.mobile");t[s]="io.metamask"}return e.filter(s=>!t.includes(String(s==null?void 0:s.rdns)))}onConnectWallet(e){this.loading||I.push("ConnectingWalletConnect",{wallet:e})}};Ze([y()],_e.prototype,"tabIdx",void 0);Ze([u()],_e.prototype,"connectors",void 0);Ze([u()],_e.prototype,"loading",void 0);_e=Ze([p("w3m-connect-custom-widget")],_e);var bt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ae=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){const n=this.connectors.filter(o=>o.type==="EXTERNAL").filter(Re.showConnector).filter(o=>o.id!==Ft.CONNECTOR_ID.COINBASE_SDK);return n!=null&&n.length?c`
      <wui-flex flexDirection="column" gap="xs">
        ${n.map(o=>c`
            <wui-list-wallet
              imageSrc=${w(z.getConnectorImage(o))}
              .installed=${!0}
              name=${o.name??"Unknown"}
              data-testid=${`wallet-selector-external-${o.id}`}
              @click=${()=>this.onConnector(o)}
              tabIdx=${w(this.tabIdx)}
            >
            </wui-list-wallet>
          `)}
      </wui-flex>
    `:(this.style.cssText="display: none",null)}onConnector(e){I.push("ConnectingExternal",{connector:e})}};bt([y()],Ae.prototype,"tabIdx",void 0);bt([u()],Ae.prototype,"connectors",void 0);Ae=bt([p("w3m-connect-external-widget")],Ae);var mt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Be=class extends ${constructor(){super(...arguments),this.tabIdx=void 0,this.wallets=[]}render(){return this.wallets.length?c`
      <wui-flex flexDirection="column" gap="xs">
        ${this.wallets.map(e=>c`
            <wui-list-wallet
              data-testid=${`wallet-selector-featured-${e.id}`}
              imageSrc=${w(z.getWalletImage(e))}
              name=${e.name??"Unknown"}
              @click=${()=>this.onConnectWallet(e)}
              tabIdx=${w(this.tabIdx)}
            >
            </wui-list-wallet>
          `)}
      </wui-flex>
    `:(this.style.cssText="display: none",null)}onConnectWallet(e){x.selectWalletConnector(e)}};mt([y()],Be.prototype,"tabIdx",void 0);mt([y()],Be.prototype,"wallets",void 0);Be=mt([p("w3m-connect-featured-widget")],Be);var vt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ue=class extends ${constructor(){super(...arguments),this.tabIdx=void 0,this.connectors=[]}render(){const e=this.connectors.filter(Re.showConnector);return e.length===0?(this.style.cssText="display: none",null):c`
      <wui-flex flexDirection="column" gap="xs">
        ${e.map(i=>c`
            <wui-list-wallet
              imageSrc=${w(z.getConnectorImage(i))}
              .installed=${!0}
              name=${i.name??"Unknown"}
              tagVariant="success"
              tagLabel="installed"
              data-testid=${`wallet-selector-${i.id}`}
              @click=${()=>this.onConnector(i)}
              tabIdx=${w(this.tabIdx)}
            >
            </wui-list-wallet>
          `)}
      </wui-flex>
    `}onConnector(e){x.setActiveConnector(e),I.push("ConnectingExternal",{connector:e})}};vt([y()],Ue.prototype,"tabIdx",void 0);vt([y()],Ue.prototype,"connectors",void 0);Ue=vt([p("w3m-connect-injected-widget")],Ue);var xt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ne=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){const e=this.connectors.filter(i=>i.type==="MULTI_CHAIN"&&i.name!=="WalletConnect");return e!=null&&e.length?c`
      <wui-flex flexDirection="column" gap="xs">
        ${e.map(i=>c`
            <wui-list-wallet
              imageSrc=${w(z.getConnectorImage(i))}
              .installed=${!0}
              name=${i.name??"Unknown"}
              tagVariant="shade"
              tagLabel="multichain"
              data-testid=${`wallet-selector-${i.id}`}
              @click=${()=>this.onConnector(i)}
              tabIdx=${w(this.tabIdx)}
            >
            </wui-list-wallet>
          `)}
      </wui-flex>
    `:(this.style.cssText="display: none",null)}onConnector(e){x.setActiveConnector(e),I.push("ConnectingMultiChain")}};xt([y()],Ne.prototype,"tabIdx",void 0);xt([u()],Ne.prototype,"connectors",void 0);Ne=xt([p("w3m-connect-multi-chain-widget")],Ne);var Je=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ie=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.loading=!1,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e)),h.isTelegram()&&h.isIos()&&(this.loading=!g.state.wcUri,this.unsubscribe.push(g.subscribeKey("wcUri",e=>this.loading=!e)))}render(){const i=Qe.getRecentWallets().filter(n=>!Ye.isExcluded(n)).filter(n=>!this.hasWalletConnector(n)).filter(n=>this.isWalletCompatibleWithCurrentChain(n));return i.length?c`
      <wui-flex flexDirection="column" gap="xs">
        ${i.map(n=>c`
            <wui-list-wallet
              imageSrc=${w(z.getWalletImage(n))}
              name=${n.name??"Unknown"}
              @click=${()=>this.onConnectWallet(n)}
              tagLabel="recent"
              tagVariant="shade"
              tabIdx=${w(this.tabIdx)}
              ?loading=${this.loading}
            >
            </wui-list-wallet>
          `)}
      </wui-flex>
    `:(this.style.cssText="display: none",null)}onConnectWallet(e){this.loading||x.selectWalletConnector(e)}hasWalletConnector(e){return this.connectors.some(i=>i.id===e.id||i.name===e.name)}isWalletCompatibleWithCurrentChain(e){const i=ct.state.activeChain;return i&&e.chains?e.chains.some(n=>{const o=n.split(":")[0];return i===o}):!0}};Je([y()],Ie.prototype,"tabIdx",void 0);Je([u()],Ie.prototype,"connectors",void 0);Je([u()],Ie.prototype,"loading",void 0);Ie=Je([p("w3m-connect-recent-widget")],Ie);var et=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Oe=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.wallets=[],this.loading=!1,h.isTelegram()&&h.isIos()&&(this.loading=!g.state.wcUri,this.unsubscribe.push(g.subscribeKey("wcUri",e=>this.loading=!e)))}render(){const{connectors:e}=x.state,{customWallets:i,featuredWalletIds:n}=M.state,o=Qe.getRecentWallets(),t=e.find(S=>S.id==="walletConnect"),s=e.filter(S=>S.type==="INJECTED"||S.type==="ANNOUNCED"||S.type==="MULTI_CHAIN").filter(S=>S.name!=="Browser Wallet");if(!t)return null;if(n||i||!this.wallets.length)return this.style.cssText="display: none",null;const f=s.length+o.length,H=Math.max(0,2-f),k=Ye.filterOutDuplicateWallets(this.wallets).slice(0,H);return k.length?c`
      <wui-flex flexDirection="column" gap="xs">
        ${k.map(S=>c`
            <wui-list-wallet
              imageSrc=${w(z.getWalletImage(S))}
              name=${(S==null?void 0:S.name)??"Unknown"}
              @click=${()=>this.onConnectWallet(S)}
              tabIdx=${w(this.tabIdx)}
              ?loading=${this.loading}
            >
            </wui-list-wallet>
          `)}
      </wui-flex>
    `:(this.style.cssText="display: none",null)}onConnectWallet(e){if(this.loading)return;const i=x.getConnector(e.id,e.rdns);i?I.push("ConnectingExternal",{connector:i}):I.push("ConnectingWalletConnect",{wallet:e})}};et([y()],Oe.prototype,"tabIdx",void 0);et([y()],Oe.prototype,"wallets",void 0);et([u()],Oe.prototype,"loading",void 0);Oe=et([p("w3m-connect-recommended-widget")],Oe);var tt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Se=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.connectorImages=Rt.state.connectorImages,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e),Rt.subscribeKey("connectorImages",e=>this.connectorImages=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){if(h.isMobile())return this.style.cssText="display: none",null;const e=this.connectors.find(n=>n.id==="walletConnect");if(!e)return this.style.cssText="display: none",null;const i=e.imageUrl||this.connectorImages[(e==null?void 0:e.imageId)??""];return c`
      <wui-list-wallet
        imageSrc=${w(i)}
        name=${e.name??"Unknown"}
        @click=${()=>this.onConnector(e)}
        tagLabel="qr code"
        tagVariant="main"
        tabIdx=${w(this.tabIdx)}
        data-testid="wallet-selector-walletconnect"
      >
      </wui-list-wallet>
    `}onConnector(e){x.setActiveConnector(e),I.push("ConnectingWalletConnect")}};tt([y()],Se.prototype,"tabIdx",void 0);tt([u()],Se.prototype,"connectors",void 0);tt([u()],Se.prototype,"connectorImages",void 0);Se=tt([p("w3m-connect-walletconnect-widget")],Se);const ei=he`
  :host {
    margin-top: var(--wui-spacing-3xs);
  }
  wui-separator {
    margin: var(--wui-spacing-m) calc(var(--wui-spacing-m) * -1) var(--wui-spacing-xs)
      calc(var(--wui-spacing-m) * -1);
    width: calc(100% + var(--wui-spacing-s) * 2);
  }
`;var je=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ce=class extends ${constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=x.state.connectors,this.recommended=m.state.recommended,this.featured=m.state.featured,this.unsubscribe.push(x.subscribeKey("connectors",e=>this.connectors=e),m.subscribeKey("recommended",e=>this.recommended=e),m.subscribeKey("featured",e=>this.featured=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return c`
      <wui-flex flexDirection="column" gap="xs"> ${this.connectorListTemplate()} </wui-flex>
    `}connectorListTemplate(){const{custom:e,recent:i,announced:n,injected:o,multiChain:t,recommended:r,featured:s,external:f}=Re.getConnectorsByType(this.connectors,this.recommended,this.featured);return Re.getConnectorTypeOrder({custom:e,recent:i,announced:n,injected:o,multiChain:t,recommended:r,featured:s,external:f}).map(k=>{switch(k){case"injected":return c`
            ${t.length?c`<w3m-connect-multi-chain-widget
                  tabIdx=${w(this.tabIdx)}
                ></w3m-connect-multi-chain-widget>`:null}
            ${n.length?c`<w3m-connect-announced-widget
                  tabIdx=${w(this.tabIdx)}
                ></w3m-connect-announced-widget>`:null}
            ${o.length?c`<w3m-connect-injected-widget
                  .connectors=${o}
                  tabIdx=${w(this.tabIdx)}
                ></w3m-connect-injected-widget>`:null}
          `;case"walletConnect":return c`<w3m-connect-walletconnect-widget
            tabIdx=${w(this.tabIdx)}
          ></w3m-connect-walletconnect-widget>`;case"recent":return c`<w3m-connect-recent-widget
            tabIdx=${w(this.tabIdx)}
          ></w3m-connect-recent-widget>`;case"featured":return c`<w3m-connect-featured-widget
            .wallets=${s}
            tabIdx=${w(this.tabIdx)}
          ></w3m-connect-featured-widget>`;case"custom":return c`<w3m-connect-custom-widget
            tabIdx=${w(this.tabIdx)}
          ></w3m-connect-custom-widget>`;case"external":return c`<w3m-connect-external-widget
            tabIdx=${w(this.tabIdx)}
          ></w3m-connect-external-widget>`;case"recommended":return c`<w3m-connect-recommended-widget
            .wallets=${r}
            tabIdx=${w(this.tabIdx)}
          ></w3m-connect-recommended-widget>`;default:return console.warn(`Unknown connector type: ${k}`),null}})}};ce.styles=ei;je([y()],ce.prototype,"tabIdx",void 0);je([u()],ce.prototype,"connectors",void 0);je([u()],ce.prototype,"recommended",void 0);je([u()],ce.prototype,"featured",void 0);ce=je([p("w3m-connector-list")],ce);const ti=C`
  :host {
    display: inline-flex;
    background-color: var(--wui-color-gray-glass-002);
    border-radius: var(--wui-border-radius-3xl);
    padding: var(--wui-spacing-3xs);
    position: relative;
    height: 36px;
    min-height: 36px;
    overflow: hidden;
  }

  :host::before {
    content: '';
    position: absolute;
    pointer-events: none;
    top: 4px;
    left: 4px;
    display: block;
    width: var(--local-tab-width);
    height: 28px;
    border-radius: var(--wui-border-radius-3xl);
    background-color: var(--wui-color-gray-glass-002);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-002);
    transform: translateX(calc(var(--local-tab) * var(--local-tab-width)));
    transition: transform var(--wui-ease-out-power-1) var(--wui-duration-md);
    will-change: background-color, opacity;
  }

  :host([data-type='flex'])::before {
    left: 3px;
    transform: translateX(calc((var(--local-tab) * 34px) + (var(--local-tab) * 4px)));
  }

  :host([data-type='flex']) {
    display: flex;
    padding: 0px 0px 0px 12px;
    gap: 4px;
  }

  :host([data-type='flex']) > button > wui-text {
    position: absolute;
    left: 18px;
    opacity: 0;
  }

  button[data-active='true'] > wui-icon,
  button[data-active='true'] > wui-text {
    color: var(--wui-color-fg-100);
  }

  button[data-active='false'] > wui-icon,
  button[data-active='false'] > wui-text {
    color: var(--wui-color-fg-200);
  }

  button[data-active='true']:disabled,
  button[data-active='false']:disabled {
    background-color: transparent;
    opacity: 0.5;
    cursor: not-allowed;
  }

  button[data-active='true']:disabled > wui-text {
    color: var(--wui-color-fg-200);
  }

  button[data-active='false']:disabled > wui-text {
    color: var(--wui-color-fg-300);
  }

  button > wui-icon,
  button > wui-text {
    pointer-events: none;
    transition: color var(--wui-e ase-out-power-1) var(--wui-duration-md);
    will-change: color;
  }

  button {
    width: var(--local-tab-width);
    transition: background-color var(--wui-ease-out-power-1) var(--wui-duration-md);
    will-change: background-color;
  }

  :host([data-type='flex']) > button {
    width: 34px;
    position: relative;
    display: flex;
    justify-content: flex-start;
  }

  button:hover:enabled,
  button:active:enabled {
    background-color: transparent !important;
  }

  button:hover:enabled > wui-icon,
  button:active:enabled > wui-icon {
    transition: all var(--wui-ease-out-power-1) var(--wui-duration-lg);
    color: var(--wui-color-fg-125);
  }

  button:hover:enabled > wui-text,
  button:active:enabled > wui-text {
    transition: all var(--wui-ease-out-power-1) var(--wui-duration-lg);
    color: var(--wui-color-fg-125);
  }

  button {
    border-radius: var(--wui-border-radius-3xl);
  }
`;var ae=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let X=class extends W{constructor(){super(...arguments),this.tabs=[],this.onTabChange=()=>null,this.buttons=[],this.disabled=!1,this.localTabWidth="100px",this.activeTab=0,this.isDense=!1}render(){return this.isDense=this.tabs.length>3,this.style.cssText=`
      --local-tab: ${this.activeTab};
      --local-tab-width: ${this.localTabWidth};
    `,this.dataset.type=this.isDense?"flex":"block",this.tabs.map((e,i)=>{var o;const n=i===this.activeTab;return d`
        <button
          ?disabled=${this.disabled}
          @click=${()=>this.onTabClick(i)}
          data-active=${n}
          data-testid="tab-${(o=e.label)==null?void 0:o.toLowerCase()}"
        >
          ${this.iconTemplate(e)}
          <wui-text variant="small-600" color="inherit"> ${e.label} </wui-text>
        </button>
      `})}firstUpdated(){this.shadowRoot&&this.isDense&&(this.buttons=[...this.shadowRoot.querySelectorAll("button")],setTimeout(()=>{this.animateTabs(0,!0)},0))}iconTemplate(e){return e.icon?d`<wui-icon size="xs" color="inherit" name=${e.icon}></wui-icon>`:null}onTabClick(e){this.buttons&&this.animateTabs(e,!1),this.activeTab=e,this.onTabChange(e)}animateTabs(e,i){const n=this.buttons[this.activeTab],o=this.buttons[e],t=n==null?void 0:n.querySelector("wui-text"),r=o==null?void 0:o.querySelector("wui-text"),s=o==null?void 0:o.getBoundingClientRect(),f=r==null?void 0:r.getBoundingClientRect();n&&t&&!i&&e!==this.activeTab&&(t.animate([{opacity:0}],{duration:50,easing:"ease",fill:"forwards"}),n.animate([{width:"34px"}],{duration:500,easing:"ease",fill:"forwards"})),o&&s&&f&&r&&(e!==this.activeTab||i)&&(this.localTabWidth=`${Math.round(s.width+f.width)+6}px`,o.animate([{width:`${s.width+f.width}px`}],{duration:i?0:500,fill:"forwards",easing:"ease"}),r.animate([{opacity:1}],{duration:i?0:125,delay:i?0:200,fill:"forwards",easing:"ease"}))}};X.styles=[O,D,ti];ae([l({type:Array})],X.prototype,"tabs",void 0);ae([l()],X.prototype,"onTabChange",void 0);ae([l({type:Array})],X.prototype,"buttons",void 0);ae([l({type:Boolean})],X.prototype,"disabled",void 0);ae([l()],X.prototype,"localTabWidth",void 0);ae([zt()],X.prototype,"activeTab",void 0);ae([zt()],X.prototype,"isDense",void 0);X=ae([p("wui-tabs")],X);var yt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let qe=class extends ${constructor(){super(...arguments),this.platformTabs=[],this.unsubscribe=[],this.platforms=[],this.onSelectPlatfrom=void 0}disconnectCallback(){this.unsubscribe.forEach(e=>e())}render(){const e=this.generateTabs();return c`
      <wui-flex justifyContent="center" .padding=${["0","0","l","0"]}>
        <wui-tabs .tabs=${e} .onTabChange=${this.onTabChange.bind(this)}></wui-tabs>
      </wui-flex>
    `}generateTabs(){const e=this.platforms.map(i=>i==="browser"?{label:"Browser",icon:"extension",platform:"browser"}:i==="mobile"?{label:"Mobile",icon:"mobile",platform:"mobile"}:i==="qrcode"?{label:"Mobile",icon:"mobile",platform:"qrcode"}:i==="web"?{label:"Webapp",icon:"browser",platform:"web"}:i==="desktop"?{label:"Desktop",icon:"desktop",platform:"desktop"}:{label:"Browser",icon:"extension",platform:"unsupported"});return this.platformTabs=e.map(({platform:i})=>i),e}onTabChange(e){var n;const i=this.platformTabs[e];i&&((n=this.onSelectPlatfrom)==null||n.call(this,i))}};yt([y({type:Array})],qe.prototype,"platforms",void 0);yt([y()],qe.prototype,"onSelectPlatfrom",void 0);qe=yt([p("w3m-connecting-header")],qe);const ii=C`
  :host {
    width: var(--local-width);
    position: relative;
  }

  button {
    border: none;
    border-radius: var(--local-border-radius);
    width: var(--local-width);
    white-space: nowrap;
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='md'] {
    padding: 8.2px var(--wui-spacing-l) 9px var(--wui-spacing-l);
    height: 36px;
  }

  button[data-size='md'][data-icon-left='true'][data-icon-right='false'] {
    padding: 8.2px var(--wui-spacing-l) 9px var(--wui-spacing-s);
  }

  button[data-size='md'][data-icon-right='true'][data-icon-left='false'] {
    padding: 8.2px var(--wui-spacing-s) 9px var(--wui-spacing-l);
  }

  button[data-size='lg'] {
    padding: var(--wui-spacing-m) var(--wui-spacing-2l);
    height: 48px;
  }

  /* -- Variants --------------------------------------------------------- */
  button[data-variant='main'] {
    background-color: var(--wui-color-accent-100);
    color: var(--wui-color-inverse-100);
    border: none;
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-010);
  }

  button[data-variant='inverse'] {
    background-color: var(--wui-color-inverse-100);
    color: var(--wui-color-inverse-000);
    border: none;
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-010);
  }

  button[data-variant='accent'] {
    background-color: var(--wui-color-accent-glass-010);
    color: var(--wui-color-accent-100);
    border: none;
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-005);
  }

  button[data-variant='accent-error'] {
    background: var(--wui-color-error-glass-015);
    color: var(--wui-color-error-100);
    border: none;
    box-shadow: inset 0 0 0 1px var(--wui-color-error-glass-010);
  }

  button[data-variant='accent-success'] {
    background: var(--wui-color-success-glass-015);
    color: var(--wui-color-success-100);
    border: none;
    box-shadow: inset 0 0 0 1px var(--wui-color-success-glass-010);
  }

  button[data-variant='neutral'] {
    background: transparent;
    color: var(--wui-color-fg-100);
    border: none;
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-005);
  }

  /* -- Focus states --------------------------------------------------- */
  button[data-variant='main']:focus-visible:enabled {
    background-color: var(--wui-color-accent-090);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-accent-100),
      0 0 0 4px var(--wui-color-accent-glass-020);
  }
  button[data-variant='inverse']:focus-visible:enabled {
    background-color: var(--wui-color-inverse-100);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-gray-glass-010),
      0 0 0 4px var(--wui-color-accent-glass-020);
  }
  button[data-variant='accent']:focus-visible:enabled {
    background-color: var(--wui-color-accent-glass-010);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-accent-100),
      0 0 0 4px var(--wui-color-accent-glass-020);
  }
  button[data-variant='accent-error']:focus-visible:enabled {
    background: var(--wui-color-error-glass-015);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-error-100),
      0 0 0 4px var(--wui-color-error-glass-020);
  }
  button[data-variant='accent-success']:focus-visible:enabled {
    background: var(--wui-color-success-glass-015);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-success-100),
      0 0 0 4px var(--wui-color-success-glass-020);
  }
  button[data-variant='neutral']:focus-visible:enabled {
    background: var(--wui-color-gray-glass-005);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-gray-glass-010),
      0 0 0 4px var(--wui-color-gray-glass-002);
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) and (pointer: fine) {
    button[data-variant='main']:hover:enabled {
      background-color: var(--wui-color-accent-090);
    }

    button[data-variant='main']:active:enabled {
      background-color: var(--wui-color-accent-080);
    }

    button[data-variant='accent']:hover:enabled {
      background-color: var(--wui-color-accent-glass-015);
    }

    button[data-variant='accent']:active:enabled {
      background-color: var(--wui-color-accent-glass-020);
    }

    button[data-variant='accent-error']:hover:enabled {
      background: var(--wui-color-error-glass-020);
      color: var(--wui-color-error-100);
    }

    button[data-variant='accent-error']:active:enabled {
      background: var(--wui-color-error-glass-030);
      color: var(--wui-color-error-100);
    }

    button[data-variant='accent-success']:hover:enabled {
      background: var(--wui-color-success-glass-020);
      color: var(--wui-color-success-100);
    }

    button[data-variant='accent-success']:active:enabled {
      background: var(--wui-color-success-glass-030);
      color: var(--wui-color-success-100);
    }

    button[data-variant='neutral']:hover:enabled {
      background: var(--wui-color-gray-glass-002);
    }

    button[data-variant='neutral']:active:enabled {
      background: var(--wui-color-gray-glass-005);
    }

    button[data-size='lg'][data-icon-left='true'][data-icon-right='false'] {
      padding-left: var(--wui-spacing-m);
    }

    button[data-size='lg'][data-icon-right='true'][data-icon-left='false'] {
      padding-right: var(--wui-spacing-m);
    }
  }

  /* -- Disabled state --------------------------------------------------- */
  button:disabled {
    background-color: var(--wui-color-gray-glass-002);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-002);
    color: var(--wui-color-gray-glass-020);
    cursor: not-allowed;
  }

  button > wui-text {
    transition: opacity var(--wui-ease-out-power-1) var(--wui-duration-md);
    will-change: opacity;
    opacity: var(--local-opacity-100);
  }

  ::slotted(*) {
    transition: opacity var(--wui-ease-out-power-1) var(--wui-duration-md);
    will-change: opacity;
    opacity: var(--local-opacity-100);
  }

  wui-loading-spinner {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    opacity: var(--local-opacity-000);
  }
`;var Q=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};const _t={main:"inverse-100",inverse:"inverse-000",accent:"accent-100","accent-error":"error-100","accent-success":"success-100",neutral:"fg-100",disabled:"gray-glass-020"},ni={lg:"paragraph-600",md:"small-600"},oi={lg:"md",md:"md"};let U=class extends W{constructor(){super(...arguments),this.size="lg",this.disabled=!1,this.fullWidth=!1,this.loading=!1,this.variant="main",this.hasIconLeft=!1,this.hasIconRight=!1,this.borderRadius="m"}render(){this.style.cssText=`
    --local-width: ${this.fullWidth?"100%":"auto"};
    --local-opacity-100: ${this.loading?0:1};
    --local-opacity-000: ${this.loading?1:0};
    --local-border-radius: var(--wui-border-radius-${this.borderRadius});
    `;const e=this.textVariant??ni[this.size];return d`
      <button
        data-variant=${this.variant}
        data-icon-left=${this.hasIconLeft}
        data-icon-right=${this.hasIconRight}
        data-size=${this.size}
        ?disabled=${this.disabled}
      >
        ${this.loadingTemplate()}
        <slot name="iconLeft" @slotchange=${()=>this.handleSlotLeftChange()}></slot>
        <wui-text variant=${e} color="inherit">
          <slot></slot>
        </wui-text>
        <slot name="iconRight" @slotchange=${()=>this.handleSlotRightChange()}></slot>
      </button>
    `}handleSlotLeftChange(){this.hasIconLeft=!0}handleSlotRightChange(){this.hasIconRight=!0}loadingTemplate(){if(this.loading){const e=oi[this.size],i=this.disabled?_t.disabled:_t[this.variant];return d`<wui-loading-spinner color=${i} size=${e}></wui-loading-spinner>`}return d``}};U.styles=[O,D,ii];Q([l()],U.prototype,"size",void 0);Q([l({type:Boolean})],U.prototype,"disabled",void 0);Q([l({type:Boolean})],U.prototype,"fullWidth",void 0);Q([l({type:Boolean})],U.prototype,"loading",void 0);Q([l()],U.prototype,"variant",void 0);Q([l({type:Boolean})],U.prototype,"hasIconLeft",void 0);Q([l({type:Boolean})],U.prototype,"hasIconRight",void 0);Q([l()],U.prototype,"borderRadius",void 0);Q([l()],U.prototype,"textVariant",void 0);U=Q([p("wui-button")],U);const ri=C`
  button {
    padding: var(--wui-spacing-4xs) var(--wui-spacing-xxs);
    border-radius: var(--wui-border-radius-3xs);
    background-color: transparent;
    color: var(--wui-color-accent-100);
  }

  button:disabled {
    background-color: transparent;
    color: var(--wui-color-gray-glass-015);
  }

  button:hover {
    background-color: var(--wui-color-gray-glass-005);
  }
`;var it=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ge=class extends W{constructor(){super(...arguments),this.tabIdx=void 0,this.disabled=!1,this.color="inherit"}render(){return d`
      <button ?disabled=${this.disabled} tabindex=${te(this.tabIdx)}>
        <slot name="iconLeft"></slot>
        <wui-text variant="small-600" color=${this.color}>
          <slot></slot>
        </wui-text>
        <slot name="iconRight"></slot>
      </button>
    `}};ge.styles=[O,D,ri];it([l()],ge.prototype,"tabIdx",void 0);it([l({type:Boolean})],ge.prototype,"disabled",void 0);it([l()],ge.prototype,"color",void 0);ge=it([p("wui-link")],ge);const ai=C`
  :host {
    display: block;
    width: var(--wui-box-size-md);
    height: var(--wui-box-size-md);
  }

  svg {
    width: var(--wui-box-size-md);
    height: var(--wui-box-size-md);
  }

  rect {
    fill: none;
    stroke: var(--wui-color-accent-100);
    stroke-width: 4px;
    stroke-linecap: round;
    animation: dash 1s linear infinite;
  }

  @keyframes dash {
    to {
      stroke-dashoffset: 0px;
    }
  }
`;var Dt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Me=class extends W{constructor(){super(...arguments),this.radius=36}render(){return this.svgLoaderTemplate()}svgLoaderTemplate(){const e=this.radius>50?50:this.radius,n=36-e,o=116+n,t=245+n,r=360+n*1.75;return d`
      <svg viewBox="0 0 110 110" width="110" height="110">
        <rect
          x="2"
          y="2"
          width="106"
          height="106"
          rx=${e}
          stroke-dasharray="${o} ${t}"
          stroke-dashoffset=${r}
        />
      </svg>
    `}};Me.styles=[O,ai];Dt([l({type:Number})],Me.prototype,"radius",void 0);Me=Dt([p("wui-loading-thumbnail")],Me);const si=C`
  button {
    border: none;
    border-radius: var(--wui-border-radius-3xl);
  }

  button[data-variant='main'] {
    background-color: var(--wui-color-accent-100);
    color: var(--wui-color-inverse-100);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-010);
  }

  button[data-variant='accent'] {
    background-color: var(--wui-color-accent-glass-010);
    color: var(--wui-color-accent-100);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-005);
  }

  button[data-variant='gray'] {
    background-color: transparent;
    color: var(--wui-color-fg-200);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-010);
  }

  button[data-variant='shade'] {
    background-color: transparent;
    color: var(--wui-color-accent-100);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-010);
  }

  button[data-size='sm'] {
    height: 32px;
    padding: 0 var(--wui-spacing-s);
  }

  button[data-size='md'] {
    height: 40px;
    padding: 0 var(--wui-spacing-l);
  }

  button[data-size='sm'] > wui-image {
    width: 16px;
    height: 16px;
  }

  button[data-size='md'] > wui-image {
    width: 24px;
    height: 24px;
  }

  button[data-size='sm'] > wui-icon {
    width: 12px;
    height: 12px;
  }

  button[data-size='md'] > wui-icon {
    width: 14px;
    height: 14px;
  }

  wui-image {
    border-radius: var(--wui-border-radius-3xl);
    overflow: hidden;
  }

  button.disabled > wui-icon,
  button.disabled > wui-image {
    filter: grayscale(1);
  }

  button[data-variant='main'] > wui-image {
    box-shadow: inset 0 0 0 1px var(--wui-color-accent-090);
  }

  button[data-variant='shade'] > wui-image,
  button[data-variant='gray'] > wui-image {
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-010);
  }

  @media (hover: hover) and (pointer: fine) {
    button[data-variant='main']:focus-visible {
      background-color: var(--wui-color-accent-090);
    }

    button[data-variant='main']:hover:enabled {
      background-color: var(--wui-color-accent-090);
    }

    button[data-variant='main']:active:enabled {
      background-color: var(--wui-color-accent-080);
    }

    button[data-variant='accent']:hover:enabled {
      background-color: var(--wui-color-accent-glass-015);
    }

    button[data-variant='accent']:active:enabled {
      background-color: var(--wui-color-accent-glass-020);
    }

    button[data-variant='shade']:focus-visible,
    button[data-variant='gray']:focus-visible,
    button[data-variant='shade']:hover,
    button[data-variant='gray']:hover {
      background-color: var(--wui-color-gray-glass-002);
    }

    button[data-variant='gray']:active,
    button[data-variant='shade']:active {
      background-color: var(--wui-color-gray-glass-005);
    }
  }

  button.disabled {
    color: var(--wui-color-gray-glass-020);
    background-color: var(--wui-color-gray-glass-002);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-002);
    pointer-events: none;
  }
`;var fe=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ne=class extends W{constructor(){super(...arguments),this.variant="accent",this.imageSrc="",this.disabled=!1,this.icon="externalLink",this.size="md",this.text=""}render(){const e=this.size==="sm"?"small-600":"paragraph-600";return d`
      <button
        class=${this.disabled?"disabled":""}
        data-variant=${this.variant}
        data-size=${this.size}
      >
        ${this.imageSrc?d`<wui-image src=${this.imageSrc}></wui-image>`:null}
        <wui-text variant=${e} color="inherit"> ${this.text} </wui-text>
        <wui-icon name=${this.icon} color="inherit" size="inherit"></wui-icon>
      </button>
    `}};ne.styles=[O,D,si];fe([l()],ne.prototype,"variant",void 0);fe([l()],ne.prototype,"imageSrc",void 0);fe([l({type:Boolean})],ne.prototype,"disabled",void 0);fe([l()],ne.prototype,"icon",void 0);fe([l()],ne.prototype,"size",void 0);fe([l()],ne.prototype,"text",void 0);ne=fe([p("wui-chip-button")],ne);const li=C`
  wui-flex {
    width: 100%;
    background-color: var(--wui-color-gray-glass-002);
    border-radius: var(--wui-border-radius-xs);
  }
`;var nt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let be=class extends W{constructor(){super(...arguments),this.disabled=!1,this.label="",this.buttonLabel=""}render(){return d`
      <wui-flex
        justifyContent="space-between"
        alignItems="center"
        .padding=${["1xs","2l","1xs","2l"]}
      >
        <wui-text variant="paragraph-500" color="fg-200">${this.label}</wui-text>
        <wui-chip-button size="sm" variant="shade" text=${this.buttonLabel} icon="chevronRight">
        </wui-chip-button>
      </wui-flex>
    `}};be.styles=[O,D,li];nt([l({type:Boolean})],be.prototype,"disabled",void 0);nt([l()],be.prototype,"label",void 0);nt([l()],be.prototype,"buttonLabel",void 0);be=nt([p("wui-cta-button")],be);const ci=he`
  :host {
    display: block;
    padding: 0 var(--wui-spacing-xl) var(--wui-spacing-xl);
  }
`;var At=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ve=class extends ${constructor(){super(...arguments),this.wallet=void 0}render(){if(!this.wallet)return this.style.display="none",null;const{name:e,app_store:i,play_store:n,chrome_store:o,homepage:t}=this.wallet,r=h.isMobile(),s=h.isIos(),f=h.isAndroid(),H=[i,n,t,o].filter(Boolean).length>1,k=ee.getTruncateString({string:e,charsStart:12,charsEnd:0,truncate:"end"});return H&&!r?c`
        <wui-cta-button
          label=${`Don't have ${k}?`}
          buttonLabel="Get"
          @click=${()=>I.push("Downloads",{wallet:this.wallet})}
        ></wui-cta-button>
      `:!H&&t?c`
        <wui-cta-button
          label=${`Don't have ${k}?`}
          buttonLabel="Get"
          @click=${this.onHomePage.bind(this)}
        ></wui-cta-button>
      `:i&&s?c`
        <wui-cta-button
          label=${`Don't have ${k}?`}
          buttonLabel="Get"
          @click=${this.onAppStore.bind(this)}
        ></wui-cta-button>
      `:n&&f?c`
        <wui-cta-button
          label=${`Don't have ${k}?`}
          buttonLabel="Get"
          @click=${this.onPlayStore.bind(this)}
        ></wui-cta-button>
      `:(this.style.display="none",null)}onAppStore(){var e;(e=this.wallet)!=null&&e.app_store&&h.openHref(this.wallet.app_store,"_blank")}onPlayStore(){var e;(e=this.wallet)!=null&&e.play_store&&h.openHref(this.wallet.play_store,"_blank")}onHomePage(){var e;(e=this.wallet)!=null&&e.homepage&&h.openHref(this.wallet.homepage,"_blank")}};Ve.styles=[ci];At([y({type:Object})],Ve.prototype,"wallet",void 0);Ve=At([p("w3m-mobile-download-links")],Ve);const di=he`
  @keyframes shake {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
    100% {
      transform: translateX(0);
    }
  }

  wui-flex:first-child:not(:only-child) {
    position: relative;
  }

  wui-loading-thumbnail {
    position: absolute;
  }

  wui-icon-box {
    position: absolute;
    right: calc(var(--wui-spacing-3xs) * -1);
    bottom: calc(var(--wui-spacing-3xs) * -1);
    opacity: 0;
    transform: scale(0.5);
    transition-property: opacity, transform;
    transition-duration: var(--wui-duration-lg);
    transition-timing-function: var(--wui-ease-out-power-2);
    will-change: opacity, transform;
  }

  wui-text[align='center'] {
    width: 100%;
    padding: 0px var(--wui-spacing-l);
  }

  [data-error='true'] wui-icon-box {
    opacity: 1;
    transform: scale(1);
  }

  [data-error='true'] > wui-flex:first-child {
    animation: shake 250ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }

  [data-retry='false'] wui-link {
    display: none;
  }

  [data-retry='true'] wui-link {
    display: block;
    opacity: 1;
  }
`;var Y=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};class E extends ${constructor(){var e,i,n,o,t;super(),this.wallet=(e=I.state.data)==null?void 0:e.wallet,this.connector=(i=I.state.data)==null?void 0:i.connector,this.timeout=void 0,this.secondaryBtnIcon="refresh",this.onConnect=void 0,this.onRender=void 0,this.onAutoConnect=void 0,this.isWalletConnect=!0,this.unsubscribe=[],this.imageSrc=z.getWalletImage(this.wallet)??z.getConnectorImage(this.connector),this.name=((n=this.wallet)==null?void 0:n.name)??((o=this.connector)==null?void 0:o.name)??"Wallet",this.isRetrying=!1,this.uri=g.state.wcUri,this.error=g.state.wcError,this.ready=!1,this.showRetry=!1,this.secondaryBtnLabel="Try again",this.secondaryLabel="Accept connection request in the wallet",this.isLoading=!1,this.isMobile=!1,this.onRetry=void 0,this.unsubscribe.push(g.subscribeKey("wcUri",r=>{var s;this.uri=r,this.isRetrying&&this.onRetry&&(this.isRetrying=!1,(s=this.onConnect)==null||s.call(this))}),g.subscribeKey("wcError",r=>this.error=r)),(h.isTelegram()||h.isSafari())&&h.isIos()&&g.state.wcUri&&((t=this.onConnect)==null||t.call(this))}firstUpdated(){var e;(e=this.onAutoConnect)==null||e.call(this),this.showRetry=!this.onAutoConnect}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),g.setWcError(!1),clearTimeout(this.timeout)}render(){var n;(n=this.onRender)==null||n.call(this),this.onShowRetry();const e=this.error?"Connection can be declined if a previous request is still active":this.secondaryLabel;let i=`Continue in ${this.name}`;return this.error&&(i="Connection declined"),c`
      <wui-flex
        data-error=${w(this.error)}
        data-retry=${this.showRetry}
        flexDirection="column"
        alignItems="center"
        .padding=${["3xl","xl","xl","xl"]}
        gap="xl"
      >
        <wui-flex justifyContent="center" alignItems="center">
          <wui-wallet-image size="lg" imageSrc=${w(this.imageSrc)}></wui-wallet-image>

          ${this.error?null:this.loaderTemplate()}

          <wui-icon-box
            backgroundColor="error-100"
            background="opaque"
            iconColor="error-100"
            icon="close"
            size="sm"
            border
            borderColor="wui-color-bg-125"
          ></wui-icon-box>
        </wui-flex>

        <wui-flex flexDirection="column" alignItems="center" gap="xs">
          <wui-text variant="paragraph-500" color=${this.error?"error-100":"fg-100"}>
            ${i}
          </wui-text>
          <wui-text align="center" variant="small-500" color="fg-200">${e}</wui-text>
        </wui-flex>

        ${this.secondaryBtnLabel?c`
              <wui-button
                variant="accent"
                size="md"
                ?disabled=${this.isRetrying||this.isLoading}
                @click=${this.onTryAgain.bind(this)}
                data-testid="w3m-connecting-widget-secondary-button"
              >
                <wui-icon color="inherit" slot="iconLeft" name=${this.secondaryBtnIcon}></wui-icon>
                ${this.secondaryBtnLabel}
              </wui-button>
            `:null}
      </wui-flex>

      ${this.isWalletConnect?c`
            <wui-flex .padding=${["0","xl","xl","xl"]} justifyContent="center">
              <wui-link @click=${this.onCopyUri} color="fg-200" data-testid="wui-link-copy">
                <wui-icon size="xs" color="fg-200" slot="iconLeft" name="copy"></wui-icon>
                Copy link
              </wui-link>
            </wui-flex>
          `:null}

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}onShowRetry(){var e;if(this.error&&!this.showRetry){this.showRetry=!0;const i=(e=this.shadowRoot)==null?void 0:e.querySelector("wui-button");i==null||i.animate([{opacity:0},{opacity:1}],{fill:"forwards",easing:"ease"})}}onTryAgain(){var e,i;g.setWcError(!1),this.onRetry?(this.isRetrying=!0,(e=this.onRetry)==null||e.call(this)):(i=this.onConnect)==null||i.call(this)}loaderTemplate(){const e=dt.state.themeVariables["--w3m-border-radius-master"],i=e?parseInt(e.replace("px",""),10):4;return c`<wui-loading-thumbnail radius=${i*9}></wui-loading-thumbnail>`}onCopyUri(){try{this.uri&&(h.copyToClopboard(this.uri),ze.showSuccess("Link copied"))}catch{ze.showError("Failed to copy")}}}E.styles=di;Y([u()],E.prototype,"isRetrying",void 0);Y([u()],E.prototype,"uri",void 0);Y([u()],E.prototype,"error",void 0);Y([u()],E.prototype,"ready",void 0);Y([u()],E.prototype,"showRetry",void 0);Y([u()],E.prototype,"secondaryBtnLabel",void 0);Y([u()],E.prototype,"secondaryLabel",void 0);Y([u()],E.prototype,"isLoading",void 0);Y([y({type:Boolean})],E.prototype,"isMobile",void 0);Y([y()],E.prototype,"onRetry",void 0);var ui=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let It=class extends E{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-browser: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onAutoConnect=this.onConnectProxy.bind(this),V.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser"}})}async onConnectProxy(){var e;try{this.error=!1;const{connectors:i}=x.state,n=i.find(o=>{var t,r,s;return o.type==="ANNOUNCED"&&((t=o.info)==null?void 0:t.rdns)===((r=this.wallet)==null?void 0:r.rdns)||o.type==="INJECTED"||o.name===((s=this.wallet)==null?void 0:s.name)});if(n)await g.connectExternal(n,n.chain);else throw new Error("w3m-connecting-wc-browser: No connector found");kt.close(),V.sendEvent({type:"track",event:"CONNECT_SUCCESS",properties:{method:"browser",name:((e=this.wallet)==null?void 0:e.name)||"Unknown"}})}catch(i){V.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:(i==null?void 0:i.message)??"Unknown"}}),this.error=!0}}};It=ui([p("w3m-connecting-wc-browser")],It);var pi=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ot=class extends E{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-desktop: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onRender=this.onRenderProxy.bind(this),V.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"desktop"}})}onRenderProxy(){var e;!this.ready&&this.uri&&(this.ready=!0,(e=this.onConnect)==null||e.call(this))}onConnectProxy(){var e;if((e=this.wallet)!=null&&e.desktop_link&&this.uri)try{this.error=!1;const{desktop_link:i,name:n}=this.wallet,{redirect:o,href:t}=h.formatNativeUrl(i,this.uri);g.setWcLinking({name:n,href:t}),g.setRecentWallet(this.wallet),h.openHref(o,"_blank")}catch{this.error=!0}}};Ot=pi([p("w3m-connecting-wc-desktop")],Ot);var ye=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let de=class extends E{constructor(){if(super(),this.btnLabelTimeout=void 0,this.redirectDeeplink=void 0,this.redirectUniversalLink=void 0,this.target=void 0,this.preferUniversalLinks=M.state.experimental_preferUniversalLinks,this.isLoading=!0,this.onConnect=()=>{var e;if((e=this.wallet)!=null&&e.mobile_link&&this.uri)try{this.error=!1;const{mobile_link:i,link_mode:n,name:o}=this.wallet,{redirect:t,redirectUniversalLink:r,href:s}=h.formatNativeUrl(i,this.uri,n);this.redirectDeeplink=t,this.redirectUniversalLink=r,this.target=h.isIframe()?"_top":"_self",g.setWcLinking({name:o,href:s}),g.setRecentWallet(this.wallet),this.preferUniversalLinks&&this.redirectUniversalLink?h.openHref(this.redirectUniversalLink,this.target):h.openHref(this.redirectDeeplink,this.target)}catch(i){V.sendEvent({type:"track",event:"CONNECT_PROXY_ERROR",properties:{message:i instanceof Error?i.message:"Error parsing the deeplink",uri:this.uri,mobile_link:this.wallet.mobile_link,name:this.wallet.name}}),this.error=!0}},!this.wallet)throw new Error("w3m-connecting-wc-mobile: No wallet provided");this.secondaryBtnLabel="Open",this.secondaryLabel=Lt.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.onHandleURI(),this.unsubscribe.push(g.subscribeKey("wcUri",()=>{this.onHandleURI()})),V.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"mobile"}})}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.btnLabelTimeout)}onHandleURI(){var e;this.isLoading=!this.uri,!this.ready&&this.uri&&(this.ready=!0,(e=this.onConnect)==null||e.call(this))}onTryAgain(){var e;g.setWcError(!1),(e=this.onConnect)==null||e.call(this)}};ye([u()],de.prototype,"redirectDeeplink",void 0);ye([u()],de.prototype,"redirectUniversalLink",void 0);ye([u()],de.prototype,"target",void 0);ye([u()],de.prototype,"preferUniversalLinks",void 0);ye([u()],de.prototype,"isLoading",void 0);de=ye([p("w3m-connecting-wc-mobile")],de);const hi=.1,St=2.5,J=7;function at(a,e,i){return a===e?!1:(a-e<0?e-a:a-e)<=i+hi}function wi(a,e){const i=Array.prototype.slice.call(Qt.create(a,{errorCorrectionLevel:e}).modules.data,0),n=Math.sqrt(i.length);return i.reduce((o,t,r)=>(r%n===0?o.push([t]):o[o.length-1].push(t))&&o,[])}const fi={generate({uri:a,size:e,logoSize:i,dotColor:n="#141414"}){const o="transparent",r=[],s=wi(a,"Q"),f=e/s.length,H=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];H.forEach(({x:R,y:b})=>{const j=(s.length-J)*f*R,v=(s.length-J)*f*b,L=.45;for(let _=0;_<H.length;_+=1){const F=f*(J-_*2);r.push(We`
            <rect
              fill=${_===2?n:o}
              width=${_===0?F-5:F}
              rx= ${_===0?(F-5)*L:F*L}
              ry= ${_===0?(F-5)*L:F*L}
              stroke=${n}
              stroke-width=${_===0?5:0}
              height=${_===0?F-5:F}
              x= ${_===0?v+f*_+5/2:v+f*_}
              y= ${_===0?j+f*_+5/2:j+f*_}
            />
          `)}});const k=Math.floor((i+25)/f),S=s.length/2-k/2,Ce=s.length/2+k/2-1,Le=[];s.forEach((R,b)=>{R.forEach((j,v)=>{if(s[b][v]&&!(b<J&&v<J||b>s.length-(J+1)&&v<J||b<J&&v>s.length-(J+1))&&!(b>S&&b<Ce&&v>S&&v<Ce)){const L=b*f+f/2,_=v*f+f/2;Le.push([L,_])}})});const se={};return Le.forEach(([R,b])=>{var j;se[R]?(j=se[R])==null||j.push(b):se[R]=[b]}),Object.entries(se).map(([R,b])=>{const j=b.filter(v=>b.every(L=>!at(v,L,f)));return[Number(R),j]}).forEach(([R,b])=>{b.forEach(j=>{r.push(We`<circle cx=${R} cy=${j} fill=${n} r=${f/St} />`)})}),Object.entries(se).filter(([R,b])=>b.length>1).map(([R,b])=>{const j=b.filter(v=>b.some(L=>at(v,L,f)));return[Number(R),j]}).map(([R,b])=>{b.sort((v,L)=>v<L?-1:1);const j=[];for(const v of b){const L=j.find(_=>_.some(F=>at(v,F,f)));L?L.push(v):j.push([v])}return[R,j.map(v=>[v[0],v[v.length-1]])]}).forEach(([R,b])=>{b.forEach(([j,v])=>{r.push(We`
              <line
                x1=${R}
                x2=${R}
                y1=${j}
                y2=${v}
                stroke=${n}
                stroke-width=${f/(St/2)}
                stroke-linecap="round"
              />
            `)})}),r}},gi=C`
  :host {
    position: relative;
    user-select: none;
    display: block;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    width: var(--local-size);
  }

  :host([data-theme='dark']) {
    border-radius: clamp(0px, var(--wui-border-radius-l), 40px);
    background-color: var(--wui-color-inverse-100);
    padding: var(--wui-spacing-l);
  }

  :host([data-theme='light']) {
    box-shadow: 0 0 0 1px var(--wui-color-bg-125);
    background-color: var(--wui-color-bg-125);
  }

  :host([data-clear='true']) > wui-icon {
    display: none;
  }

  svg:first-child,
  wui-image,
  wui-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translateY(-50%) translateX(-50%);
  }

  wui-image {
    width: 25%;
    height: 25%;
    border-radius: var(--wui-border-radius-xs);
  }

  wui-icon {
    width: 100%;
    height: 100%;
    color: var(--local-icon-color) !important;
    transform: translateY(-50%) translateX(-50%) scale(0.25);
  }
`;var oe=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};const bi="#3396ff";let G=class extends W{constructor(){super(...arguments),this.uri="",this.size=0,this.theme="dark",this.imageSrc=void 0,this.alt=void 0,this.arenaClear=void 0,this.farcaster=void 0}render(){return this.dataset.theme=this.theme,this.dataset.clear=String(this.arenaClear),this.style.cssText=`
     --local-size: ${this.size}px;
     --local-icon-color: ${this.color??bi}
    `,d`${this.templateVisual()} ${this.templateSvg()}`}templateSvg(){const e=this.theme==="light"?this.size:this.size-32;return We`
      <svg height=${e} width=${e}>
        ${fi.generate({uri:this.uri,size:e,logoSize:this.arenaClear?0:e/4,dotColor:this.color})}
      </svg>
    `}templateVisual(){return this.imageSrc?d`<wui-image src=${this.imageSrc} alt=${this.alt??"logo"}></wui-image>`:this.farcaster?d`<wui-icon
        class="farcaster"
        size="inherit"
        color="inherit"
        name="farcaster"
      ></wui-icon>`:d`<wui-icon size="inherit" color="inherit" name="walletConnect"></wui-icon>`}};G.styles=[O,gi];oe([l()],G.prototype,"uri",void 0);oe([l({type:Number})],G.prototype,"size",void 0);oe([l()],G.prototype,"theme",void 0);oe([l()],G.prototype,"imageSrc",void 0);oe([l()],G.prototype,"alt",void 0);oe([l()],G.prototype,"color",void 0);oe([l({type:Boolean})],G.prototype,"arenaClear",void 0);oe([l({type:Boolean})],G.prototype,"farcaster",void 0);G=oe([p("wui-qr-code")],G);const mi=C`
  :host {
    display: block;
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-005);
    background: linear-gradient(
      120deg,
      var(--wui-color-bg-200) 5%,
      var(--wui-color-bg-200) 48%,
      var(--wui-color-bg-300) 55%,
      var(--wui-color-bg-300) 60%,
      var(--wui-color-bg-300) calc(60% + 10px),
      var(--wui-color-bg-200) calc(60% + 12px),
      var(--wui-color-bg-200) 100%
    );
    background-size: 250%;
    animation: shimmer 3s linear infinite reverse;
  }

  :host([variant='light']) {
    background: linear-gradient(
      120deg,
      var(--wui-color-bg-150) 5%,
      var(--wui-color-bg-150) 48%,
      var(--wui-color-bg-200) 55%,
      var(--wui-color-bg-200) 60%,
      var(--wui-color-bg-200) calc(60% + 10px),
      var(--wui-color-bg-150) calc(60% + 12px),
      var(--wui-color-bg-150) 100%
    );
    background-size: 250%;
  }

  @keyframes shimmer {
    from {
      background-position: -250% 0;
    }
    to {
      background-position: 250% 0;
    }
  }
`;var Te=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ue=class extends W{constructor(){super(...arguments),this.width="",this.height="",this.borderRadius="m",this.variant="default"}render(){return this.style.cssText=`
      width: ${this.width};
      height: ${this.height};
      border-radius: ${`clamp(0px,var(--wui-border-radius-${this.borderRadius}), 40px)`};
    `,d`<slot></slot>`}};ue.styles=[mi];Te([l()],ue.prototype,"width",void 0);Te([l()],ue.prototype,"height",void 0);Te([l()],ue.prototype,"borderRadius",void 0);Te([l()],ue.prototype,"variant",void 0);ue=Te([p("wui-shimmer")],ue);const vi="https://reown.com",xi=C`
  .reown-logo {
    height: var(--wui-spacing-xxl);
  }

  a {
    text-decoration: none;
    cursor: pointer;
  }

  a:hover {
    opacity: 0.9;
  }
`;var yi=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ut=class extends W{render(){return d`
      <a
        data-testid="ux-branding-reown"
        href=${vi}
        rel="noreferrer"
        target="_blank"
        style="text-decoration: none;"
      >
        <wui-flex
          justifyContent="center"
          alignItems="center"
          gap="xs"
          .padding=${["0","0","l","0"]}
        >
          <wui-text variant="small-500" color="fg-100"> UX by </wui-text>
          <wui-icon name="reown" size="xxxl" class="reown-logo"></wui-icon>
        </wui-flex>
      </a>
    `}};ut.styles=[O,D,xi];ut=yi([p("wui-ux-by-reown")],ut);const $i=he`
  @keyframes fadein {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  wui-shimmer {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: clamp(0px, var(--wui-border-radius-l), 40px) !important;
  }

  wui-qr-code {
    opacity: 0;
    animation-duration: 200ms;
    animation-timing-function: ease;
    animation-name: fadein;
    animation-fill-mode: forwards;
  }
`;var Ci=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let pt=class extends E{constructor(){var e;super(),this.forceUpdate=()=>{this.requestUpdate()},window.addEventListener("resize",this.forceUpdate),V.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:((e=this.wallet)==null?void 0:e.name)??"WalletConnect",platform:"qrcode"}})}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this.unsubscribe)==null||e.forEach(i=>i()),window.removeEventListener("resize",this.forceUpdate)}render(){return this.onRenderProxy(),c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["0","xl","xl","xl"]}
        gap="xl"
      >
        <wui-shimmer borderRadius="l" width="100%"> ${this.qrCodeTemplate()} </wui-shimmer>

        <wui-text variant="paragraph-500" color="fg-100">
          Scan this QR Code with your phone
        </wui-text>
        ${this.copyTemplate()}
      </wui-flex>
      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}onRenderProxy(){!this.ready&&this.uri&&(this.timeout=setTimeout(()=>{this.ready=!0},200))}qrCodeTemplate(){if(!this.uri||!this.ready)return null;const e=this.getBoundingClientRect().width-40,i=this.wallet?this.wallet.name:void 0;return g.setWcLinking(void 0),g.setRecentWallet(this.wallet),c` <wui-qr-code
      size=${e}
      theme=${dt.state.themeMode}
      uri=${this.uri}
      imageSrc=${w(z.getWalletImage(this.wallet))}
      color=${w(dt.state.themeVariables["--w3m-qr-color"])}
      alt=${w(i)}
      data-testid="wui-qr-code"
    ></wui-qr-code>`}copyTemplate(){const e=!this.uri||!this.ready;return c`<wui-link
      .disabled=${e}
      @click=${this.onCopyUri}
      color="fg-200"
      data-testid="copy-wc2-uri"
    >
      <wui-icon size="xs" color="fg-200" slot="iconLeft" name="copy"></wui-icon>
      Copy link
    </wui-link>`}};pt.styles=$i;pt=Ci([p("w3m-connecting-wc-qrcode")],pt);var Wi=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let jt=class extends ${constructor(){var e;if(super(),this.wallet=(e=I.state.data)==null?void 0:e.wallet,!this.wallet)throw new Error("w3m-connecting-wc-unsupported: No wallet provided");V.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser"}})}render(){return c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["3xl","xl","xl","xl"]}
        gap="xl"
      >
        <wui-wallet-image
          size="lg"
          imageSrc=${w(z.getWalletImage(this.wallet))}
        ></wui-wallet-image>

        <wui-text variant="paragraph-500" color="fg-100">Not Detected</wui-text>
      </wui-flex>

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}};jt=Wi([p("w3m-connecting-wc-unsupported")],jt);var Bt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ht=class extends E{constructor(){if(super(),this.isLoading=!0,!this.wallet)throw new Error("w3m-connecting-wc-web: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.secondaryBtnLabel="Open",this.secondaryLabel=Lt.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.updateLoadingState(),this.unsubscribe.push(g.subscribeKey("wcUri",()=>{this.updateLoadingState()})),V.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"web"}})}updateLoadingState(){this.isLoading=!this.uri}onConnectProxy(){var e;if((e=this.wallet)!=null&&e.webapp_link&&this.uri)try{this.error=!1;const{webapp_link:i,name:n}=this.wallet,{redirect:o,href:t}=h.formatUniversalUrl(i,this.uri);g.setWcLinking({name:n,href:t}),g.setRecentWallet(this.wallet),h.openHref(o,"_blank")}catch{this.error=!0}}};Bt([u()],ht.prototype,"isLoading",void 0);ht=Bt([p("w3m-connecting-wc-web")],ht);var Ee=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let me=class extends ${constructor(){var e;super(),this.wallet=(e=I.state.data)==null?void 0:e.wallet,this.unsubscribe=[],this.platform=void 0,this.platforms=[],this.isSiwxEnabled=!!M.state.siwx,this.remoteFeatures=M.state.remoteFeatures,this.determinePlatforms(),this.initializeConnection(),this.unsubscribe.push(M.subscribeKey("remoteFeatures",i=>this.remoteFeatures=i))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return c`
      ${this.headerTemplate()}
      <div>${this.platformTemplate()}</div>
      ${this.reownBrandingTemplate()}
    `}reownBrandingTemplate(){var e;return(e=this.remoteFeatures)!=null&&e.reownBranding?c`<wui-ux-by-reown></wui-ux-by-reown>`:null}async initializeConnection(e=!1){if(!(this.platform==="browser"||M.state.manualWCControl&&!e))try{const{wcPairingExpiry:i,status:n}=g.state;(e||M.state.enableEmbedded||h.isPairingExpired(i)||n==="connecting")&&(await g.connectWalletConnect(),this.isSiwxEnabled||kt.close())}catch(i){V.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:(i==null?void 0:i.message)??"Unknown"}}),g.setWcError(!0),ze.showError(i.message??"Connection error"),g.resetWcConnection(),I.goBack()}}determinePlatforms(){if(!this.wallet){this.platforms.push("qrcode"),this.platform="qrcode";return}if(this.platform)return;const{mobile_link:e,desktop_link:i,webapp_link:n,injected:o,rdns:t}=this.wallet,r=o==null?void 0:o.map(({injected_id:se})=>se).filter(Boolean),s=[...t?[t]:r??[]],f=M.state.isUniversalProvider?!1:s.length,H=e,k=n,S=g.checkInstalled(s),Ce=f&&S,Le=i&&!h.isMobile();Ce&&!ct.state.noAdapters&&this.platforms.push("browser"),H&&this.platforms.push(h.isMobile()?"mobile":"qrcode"),k&&this.platforms.push("web"),Le&&this.platforms.push("desktop"),!Ce&&f&&!ct.state.noAdapters&&this.platforms.push("unsupported"),this.platform=this.platforms[0]}platformTemplate(){switch(this.platform){case"browser":return c`<w3m-connecting-wc-browser></w3m-connecting-wc-browser>`;case"web":return c`<w3m-connecting-wc-web></w3m-connecting-wc-web>`;case"desktop":return c`
          <w3m-connecting-wc-desktop .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-desktop>
        `;case"mobile":return c`
          <w3m-connecting-wc-mobile isMobile .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-mobile>
        `;case"qrcode":return c`<w3m-connecting-wc-qrcode></w3m-connecting-wc-qrcode>`;default:return c`<w3m-connecting-wc-unsupported></w3m-connecting-wc-unsupported>`}}headerTemplate(){return this.platforms.length>1?c`
      <w3m-connecting-header
        .platforms=${this.platforms}
        .onSelectPlatfrom=${this.onSelectPlatform.bind(this)}
      >
      </w3m-connecting-header>
    `:null}async onSelectPlatform(e){var n;const i=(n=this.shadowRoot)==null?void 0:n.querySelector("div");i&&(await i.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.platform=e,i.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}};Ee([u()],me.prototype,"platform",void 0);Ee([u()],me.prototype,"platforms",void 0);Ee([u()],me.prototype,"isSiwxEnabled",void 0);Ee([u()],me.prototype,"remoteFeatures",void 0);me=Ee([p("w3m-connecting-wc-view")],me);var Ut=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let wt=class extends ${constructor(){super(...arguments),this.isMobile=h.isMobile()}render(){if(this.isMobile){const{featured:e,recommended:i}=m.state,{customWallets:n}=M.state,o=Qe.getRecentWallets(),t=e.length||i.length||(n==null?void 0:n.length)||o.length;return c`<wui-flex
        flexDirection="column"
        gap="xs"
        .margin=${["3xs","s","s","s"]}
      >
        ${t?c`<w3m-connector-list></w3m-connector-list>`:null}
        <w3m-all-wallets-widget></w3m-all-wallets-widget>
      </wui-flex>`}return c`<wui-flex flexDirection="column" .padding=${["0","0","l","0"]}>
      <w3m-connecting-wc-view></w3m-connecting-wc-view>
      <wui-flex flexDirection="column" .padding=${["0","m","0","m"]}>
        <w3m-all-wallets-widget></w3m-all-wallets-widget> </wui-flex
    ></wui-flex>`}};Ut([u()],wt.prototype,"isMobile",void 0);wt=Ut([p("w3m-connecting-wc-basic-view")],wt);/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const $t=()=>new Ri;class Ri{}const st=new WeakMap,Ct=Gt(class extends Kt{render(a){return lt}update(a,[e]){var n;const i=e!==this.G;return i&&this.rt(void 0),(i||this.lt!==this.ct)&&(this.G=e,this.ht=(n=a.options)==null?void 0:n.host,this.rt(this.ct=a.element)),lt}rt(a){if(this.G!==void 0)if(this.isConnected||(a=void 0),typeof this.G=="function"){const e=this.ht??globalThis;let i=st.get(e);i===void 0&&(i=new WeakMap,st.set(e,i)),i.get(this.G)!==void 0&&this.G.call(this.ht,void 0),i.set(this.G,a),a!==void 0&&this.G.call(this.ht,a)}else this.G.value=a}get lt(){var a,e;return typeof this.G=="function"?(a=st.get(this.ht??globalThis))==null?void 0:a.get(this.G):(e=this.G)==null?void 0:e.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}}),_i=C`
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  label {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 22px;
  }

  input {
    width: 0;
    height: 0;
    opacity: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--wui-color-blue-100);
    border-width: 1px;
    border-style: solid;
    border-color: var(--wui-color-gray-glass-002);
    border-radius: 999px;
    transition:
      background-color var(--wui-ease-inout-power-1) var(--wui-duration-md),
      border-color var(--wui-ease-inout-power-1) var(--wui-duration-md);
    will-change: background-color, border-color;
  }

  span:before {
    position: absolute;
    content: '';
    height: 16px;
    width: 16px;
    left: 3px;
    top: 2px;
    background-color: var(--wui-color-inverse-100);
    transition: transform var(--wui-ease-inout-power-1) var(--wui-duration-lg);
    will-change: transform;
    border-radius: 50%;
  }

  input:checked + span {
    border-color: var(--wui-color-gray-glass-005);
    background-color: var(--wui-color-blue-100);
  }

  input:not(:checked) + span {
    background-color: var(--wui-color-gray-glass-010);
  }

  input:checked + span:before {
    transform: translateX(calc(100% - 7px));
  }
`;var Nt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ge=class extends W{constructor(){super(...arguments),this.inputElementRef=$t(),this.checked=void 0}render(){return d`
      <label>
        <input
          ${Ct(this.inputElementRef)}
          type="checkbox"
          ?checked=${te(this.checked)}
          @change=${this.dispatchChangeEvent.bind(this)}
        />
        <span></span>
      </label>
    `}dispatchChangeEvent(){var e;this.dispatchEvent(new CustomEvent("switchChange",{detail:(e=this.inputElementRef.value)==null?void 0:e.checked,bubbles:!0,composed:!0}))}};Ge.styles=[O,D,Xt,_i];Nt([l({type:Boolean})],Ge.prototype,"checked",void 0);Ge=Nt([p("wui-switch")],Ge);const Ii=C`
  :host {
    height: 100%;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    column-gap: var(--wui-spacing-1xs);
    padding: var(--wui-spacing-xs) var(--wui-spacing-s);
    background-color: var(--wui-color-gray-glass-002);
    border-radius: var(--wui-border-radius-xs);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-002);
    transition: background-color var(--wui-ease-out-power-1) var(--wui-duration-md);
    will-change: background-color;
    cursor: pointer;
  }

  wui-switch {
    pointer-events: none;
  }
`;var qt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Ke=class extends W{constructor(){super(...arguments),this.checked=void 0}render(){return d`
      <button>
        <wui-icon size="xl" name="walletConnectBrown"></wui-icon>
        <wui-switch ?checked=${te(this.checked)}></wui-switch>
      </button>
    `}};Ke.styles=[O,D,Ii];qt([l({type:Boolean})],Ke.prototype,"checked",void 0);Ke=qt([p("wui-certified-switch")],Ke);const Oi=C`
  button {
    background-color: var(--wui-color-fg-300);
    border-radius: var(--wui-border-radius-4xs);
    width: 16px;
    height: 16px;
  }

  button:disabled {
    background-color: var(--wui-color-bg-300);
  }

  wui-icon {
    color: var(--wui-color-bg-200) !important;
  }

  button:focus-visible {
    background-color: var(--wui-color-fg-250);
    border: 1px solid var(--wui-color-accent-100);
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled {
      background-color: var(--wui-color-fg-250);
    }

    button:active:enabled {
      background-color: var(--wui-color-fg-225);
    }
  }
`;var Mt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let He=class extends W{constructor(){super(...arguments),this.icon="copy"}render(){return d`
      <button>
        <wui-icon color="inherit" size="xxs" name=${this.icon}></wui-icon>
      </button>
    `}};He.styles=[O,D,Oi];Mt([l()],He.prototype,"icon",void 0);He=Mt([p("wui-input-element")],He);const Si=C`
  :host {
    position: relative;
    width: 100%;
    display: inline-block;
    color: var(--wui-color-fg-275);
  }

  input {
    width: 100%;
    border-radius: var(--wui-border-radius-xs);
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-002);
    background: var(--wui-color-gray-glass-002);
    font-size: var(--wui-font-size-paragraph);
    letter-spacing: var(--wui-letter-spacing-paragraph);
    color: var(--wui-color-fg-100);
    transition:
      background-color var(--wui-ease-inout-power-1) var(--wui-duration-md),
      border-color var(--wui-ease-inout-power-1) var(--wui-duration-md),
      box-shadow var(--wui-ease-inout-power-1) var(--wui-duration-md);
    will-change: background-color, border-color, box-shadow;
    caret-color: var(--wui-color-accent-100);
  }

  input:disabled {
    cursor: not-allowed;
    border: 1px solid var(--wui-color-gray-glass-010);
  }

  input:disabled::placeholder,
  input:disabled + wui-icon {
    color: var(--wui-color-fg-300);
  }

  input::placeholder {
    color: var(--wui-color-fg-275);
  }

  input:focus:enabled {
    background-color: var(--wui-color-gray-glass-005);
    -webkit-box-shadow:
      inset 0 0 0 1px var(--wui-color-accent-100),
      0px 0px 0px 4px var(--wui-box-shadow-blue);
    -moz-box-shadow:
      inset 0 0 0 1px var(--wui-color-accent-100),
      0px 0px 0px 4px var(--wui-box-shadow-blue);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-accent-100),
      0px 0px 0px 4px var(--wui-box-shadow-blue);
  }

  input:hover:enabled {
    background-color: var(--wui-color-gray-glass-005);
  }

  wui-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .wui-size-sm {
    padding: 9px var(--wui-spacing-m) 10px var(--wui-spacing-s);
  }

  wui-icon + .wui-size-sm {
    padding: 9px var(--wui-spacing-m) 10px 36px;
  }

  wui-icon[data-input='sm'] {
    left: var(--wui-spacing-s);
  }

  .wui-size-md {
    padding: 15px var(--wui-spacing-m) var(--wui-spacing-l) var(--wui-spacing-m);
  }

  wui-icon + .wui-size-md,
  wui-loading-spinner + .wui-size-md {
    padding: 10.5px var(--wui-spacing-3xl) 10.5px var(--wui-spacing-3xl);
  }

  wui-icon[data-input='md'] {
    left: var(--wui-spacing-l);
  }

  .wui-size-lg {
    padding: var(--wui-spacing-s) var(--wui-spacing-s) var(--wui-spacing-s) var(--wui-spacing-l);
    letter-spacing: var(--wui-letter-spacing-medium-title);
    font-size: var(--wui-font-size-medium-title);
    font-weight: var(--wui-font-weight-light);
    line-height: 130%;
    color: var(--wui-color-fg-100);
    height: 64px;
  }

  .wui-padding-right-xs {
    padding-right: var(--wui-spacing-xs);
  }

  .wui-padding-right-s {
    padding-right: var(--wui-spacing-s);
  }

  .wui-padding-right-m {
    padding-right: var(--wui-spacing-m);
  }

  .wui-padding-right-l {
    padding-right: var(--wui-spacing-l);
  }

  .wui-padding-right-xl {
    padding-right: var(--wui-spacing-xl);
  }

  .wui-padding-right-2xl {
    padding-right: var(--wui-spacing-2xl);
  }

  .wui-padding-right-3xl {
    padding-right: var(--wui-spacing-3xl);
  }

  .wui-padding-right-4xl {
    padding-right: var(--wui-spacing-4xl);
  }

  .wui-padding-right-5xl {
    padding-right: var(--wui-spacing-5xl);
  }

  wui-icon + .wui-size-lg,
  wui-loading-spinner + .wui-size-lg {
    padding-left: 50px;
  }

  wui-icon[data-input='lg'] {
    left: var(--wui-spacing-l);
  }

  .wui-size-mdl {
    padding: 17.25px var(--wui-spacing-m) 17.25px var(--wui-spacing-m);
  }
  wui-icon + .wui-size-mdl,
  wui-loading-spinner + .wui-size-mdl {
    padding: 17.25px var(--wui-spacing-3xl) 17.25px 40px;
  }
  wui-icon[data-input='mdl'] {
    left: var(--wui-spacing-m);
  }

  input:placeholder-shown ~ ::slotted(wui-input-element),
  input:placeholder-shown ~ ::slotted(wui-icon) {
    opacity: 0;
    pointer-events: none;
  }

  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }

  ::slotted(wui-input-element),
  ::slotted(wui-icon) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  ::slotted(wui-input-element) {
    right: var(--wui-spacing-m);
  }

  ::slotted(wui-icon) {
    right: 0px;
  }
`;var Z=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let N=class extends W{constructor(){super(...arguments),this.inputElementRef=$t(),this.size="md",this.disabled=!1,this.placeholder="",this.type="text",this.value=""}render(){const e=`wui-padding-right-${this.inputRightPadding}`,n={[`wui-size-${this.size}`]:!0,[e]:!!this.inputRightPadding};return d`${this.templateIcon()}
      <input
        data-testid="wui-input-text"
        ${Ct(this.inputElementRef)}
        class=${Ht(n)}
        type=${this.type}
        enterkeyhint=${te(this.enterKeyHint)}
        ?disabled=${this.disabled}
        placeholder=${this.placeholder}
        @input=${this.dispatchInputChangeEvent.bind(this)}
        .value=${this.value||""}
        tabindex=${te(this.tabIdx)}
      />
      <slot></slot>`}templateIcon(){return this.icon?d`<wui-icon
        data-input=${this.size}
        size=${this.size}
        color="inherit"
        name=${this.icon}
      ></wui-icon>`:null}dispatchInputChangeEvent(){var e;this.dispatchEvent(new CustomEvent("inputChange",{detail:(e=this.inputElementRef.value)==null?void 0:e.value,bubbles:!0,composed:!0}))}};N.styles=[O,D,Si];Z([l()],N.prototype,"size",void 0);Z([l()],N.prototype,"icon",void 0);Z([l({type:Boolean})],N.prototype,"disabled",void 0);Z([l()],N.prototype,"placeholder",void 0);Z([l()],N.prototype,"type",void 0);Z([l()],N.prototype,"keyHint",void 0);Z([l()],N.prototype,"value",void 0);Z([l()],N.prototype,"inputRightPadding",void 0);Z([l()],N.prototype,"tabIdx",void 0);N=Z([p("wui-input-text")],N);const ji=C`
  :host {
    position: relative;
    display: inline-block;
    width: 100%;
  }
`;var Ti=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ft=class extends W{constructor(){super(...arguments),this.inputComponentRef=$t()}render(){return d`
      <wui-input-text
        ${Ct(this.inputComponentRef)}
        placeholder="Search wallet"
        icon="search"
        type="search"
        enterKeyHint="search"
        size="sm"
      >
        <wui-input-element @click=${this.clearValue} icon="close"></wui-input-element>
      </wui-input-text>
    `}clearValue(){const e=this.inputComponentRef.value,i=e==null?void 0:e.inputElementRef.value;i&&(i.value="",i.focus(),i.dispatchEvent(new Event("input")))}};ft.styles=[O,ji];ft=Ti([p("wui-search-bar")],ft);const Ei=We`<svg  viewBox="0 0 48 54" fill="none">
  <path
    d="M43.4605 10.7248L28.0485 1.61089C25.5438 0.129705 22.4562 0.129705 19.9515 1.61088L4.53951 10.7248C2.03626 12.2051 0.5 14.9365 0.5 17.886V36.1139C0.5 39.0635 2.03626 41.7949 4.53951 43.2752L19.9515 52.3891C22.4562 53.8703 25.5438 53.8703 28.0485 52.3891L43.4605 43.2752C45.9637 41.7949 47.5 39.0635 47.5 36.114V17.8861C47.5 14.9365 45.9637 12.2051 43.4605 10.7248Z"
  />
</svg>`,ki=C`
  :host {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 104px;
    row-gap: var(--wui-spacing-xs);
    padding: var(--wui-spacing-xs) 10px;
    background-color: var(--wui-color-gray-glass-002);
    border-radius: clamp(0px, var(--wui-border-radius-xs), 20px);
    position: relative;
  }

  wui-shimmer[data-type='network'] {
    border: none;
    -webkit-clip-path: var(--wui-path-network);
    clip-path: var(--wui-path-network);
  }

  svg {
    position: absolute;
    width: 48px;
    height: 54px;
    z-index: 1;
  }

  svg > path {
    stroke: var(--wui-color-gray-glass-010);
    stroke-width: 1px;
  }

  @media (max-width: 350px) {
    :host {
      width: 100%;
    }
  }
`;var Vt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Fe=class extends W{constructor(){super(...arguments),this.type="wallet"}render(){return d`
      ${this.shimmerTemplate()}
      <wui-shimmer width="56px" height="20px" borderRadius="xs"></wui-shimmer>
    `}shimmerTemplate(){return this.type==="network"?d` <wui-shimmer
          data-type=${this.type}
          width="48px"
          height="54px"
          borderRadius="xs"
        ></wui-shimmer>
        ${Ei}`:d`<wui-shimmer width="56px" height="56px" borderRadius="xs"></wui-shimmer>`}};Fe.styles=[O,D,ki];Vt([l()],Fe.prototype,"type",void 0);Fe=Vt([p("wui-card-select-loader")],Fe);const Li=C`
  :host {
    display: grid;
    width: inherit;
    height: inherit;
  }
`;var q=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let P=class extends W{render(){return this.style.cssText=`
      grid-template-rows: ${this.gridTemplateRows};
      grid-template-columns: ${this.gridTemplateColumns};
      justify-items: ${this.justifyItems};
      align-items: ${this.alignItems};
      justify-content: ${this.justifyContent};
      align-content: ${this.alignContent};
      column-gap: ${this.columnGap&&`var(--wui-spacing-${this.columnGap})`};
      row-gap: ${this.rowGap&&`var(--wui-spacing-${this.rowGap})`};
      gap: ${this.gap&&`var(--wui-spacing-${this.gap})`};
      padding-top: ${this.padding&&ee.getSpacingStyles(this.padding,0)};
      padding-right: ${this.padding&&ee.getSpacingStyles(this.padding,1)};
      padding-bottom: ${this.padding&&ee.getSpacingStyles(this.padding,2)};
      padding-left: ${this.padding&&ee.getSpacingStyles(this.padding,3)};
      margin-top: ${this.margin&&ee.getSpacingStyles(this.margin,0)};
      margin-right: ${this.margin&&ee.getSpacingStyles(this.margin,1)};
      margin-bottom: ${this.margin&&ee.getSpacingStyles(this.margin,2)};
      margin-left: ${this.margin&&ee.getSpacingStyles(this.margin,3)};
    `,d`<slot></slot>`}};P.styles=[O,Li];q([l()],P.prototype,"gridTemplateRows",void 0);q([l()],P.prototype,"gridTemplateColumns",void 0);q([l()],P.prototype,"justifyItems",void 0);q([l()],P.prototype,"alignItems",void 0);q([l()],P.prototype,"justifyContent",void 0);q([l()],P.prototype,"alignContent",void 0);q([l()],P.prototype,"columnGap",void 0);q([l()],P.prototype,"rowGap",void 0);q([l()],P.prototype,"gap",void 0);q([l()],P.prototype,"padding",void 0);q([l()],P.prototype,"margin",void 0);P=q([p("wui-grid")],P);const zi=he`
  button {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    width: 104px;
    row-gap: var(--wui-spacing-xs);
    padding: var(--wui-spacing-s) var(--wui-spacing-0);
    background-color: var(--wui-color-gray-glass-002);
    border-radius: clamp(0px, var(--wui-border-radius-xs), 20px);
    transition:
      color var(--wui-duration-lg) var(--wui-ease-out-power-1),
      background-color var(--wui-duration-lg) var(--wui-ease-out-power-1),
      border-radius var(--wui-duration-lg) var(--wui-ease-out-power-1);
    will-change: background-color, color, border-radius;
    outline: none;
    border: none;
  }

  button > wui-flex > wui-text {
    color: var(--wui-color-fg-100);
    max-width: 86px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    justify-content: center;
  }

  button > wui-flex > wui-text.certified {
    max-width: 66px;
  }

  button:hover:enabled {
    background-color: var(--wui-color-gray-glass-005);
  }

  button:disabled > wui-flex > wui-text {
    color: var(--wui-color-gray-glass-015);
  }

  [data-selected='true'] {
    background-color: var(--wui-color-accent-glass-020);
  }

  @media (hover: hover) and (pointer: fine) {
    [data-selected='true']:hover:enabled {
      background-color: var(--wui-color-accent-glass-015);
    }
  }

  [data-selected='true']:active:enabled {
    background-color: var(--wui-color-accent-glass-010);
  }

  @media (max-width: 350px) {
    button {
      width: 100%;
    }
  }
`;var ke=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let pe=class extends ${constructor(){super(),this.observer=new IntersectionObserver(()=>{}),this.visible=!1,this.imageSrc=void 0,this.imageLoading=!1,this.wallet=void 0,this.observer=new IntersectionObserver(e=>{e.forEach(i=>{i.isIntersecting?(this.visible=!0,this.fetchImageSrc()):this.visible=!1})},{threshold:.01})}firstUpdated(){this.observer.observe(this)}disconnectedCallback(){this.observer.disconnect()}render(){var i,n;const e=((i=this.wallet)==null?void 0:i.badge_type)==="certified";return c`
      <button>
        ${this.imageTemplate()}
        <wui-flex flexDirection="row" alignItems="center" justifyContent="center" gap="3xs">
          <wui-text
            variant="tiny-500"
            color="inherit"
            class=${w(e?"certified":void 0)}
            >${(n=this.wallet)==null?void 0:n.name}</wui-text
          >
          ${e?c`<wui-icon size="sm" name="walletConnectBrown"></wui-icon>`:null}
        </wui-flex>
      </button>
    `}imageTemplate(){var e,i;return!this.visible&&!this.imageSrc||this.imageLoading?this.shimmerTemplate():c`
      <wui-wallet-image
        size="md"
        imageSrc=${w(this.imageSrc)}
        name=${(e=this.wallet)==null?void 0:e.name}
        .installed=${(i=this.wallet)==null?void 0:i.installed}
        badgeSize="sm"
      >
      </wui-wallet-image>
    `}shimmerTemplate(){return c`<wui-shimmer width="56px" height="56px" borderRadius="xs"></wui-shimmer>`}async fetchImageSrc(){this.wallet&&(this.imageSrc=z.getWalletImage(this.wallet),!this.imageSrc&&(this.imageLoading=!0,this.imageSrc=await z.fetchWalletImage(this.wallet.image_id),this.imageLoading=!1))}};pe.styles=zi;ke([u()],pe.prototype,"visible",void 0);ke([u()],pe.prototype,"imageSrc",void 0);ke([u()],pe.prototype,"imageLoading",void 0);ke([y()],pe.prototype,"wallet",void 0);pe=ke([p("w3m-all-wallets-list-item")],pe);const Pi=he`
  wui-grid {
    max-height: clamp(360px, 400px, 80vh);
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  wui-loading-spinner {
    padding-top: var(--wui-spacing-l);
    padding-bottom: var(--wui-spacing-l);
    justify-content: center;
    grid-column: 1 / span 4;
  }
`;var $e=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};const Tt="local-paginator";let re=class extends ${constructor(){super(),this.unsubscribe=[],this.paginationObserver=void 0,this.loading=!m.state.wallets.length,this.wallets=m.state.wallets,this.recommended=m.state.recommended,this.featured=m.state.featured,this.filteredWallets=m.state.filteredWallets,this.unsubscribe.push(m.subscribeKey("wallets",e=>this.wallets=e),m.subscribeKey("recommended",e=>this.recommended=e),m.subscribeKey("featured",e=>this.featured=e),m.subscribeKey("filteredWallets",e=>this.filteredWallets=e))}firstUpdated(){this.initialFetch(),this.createPaginationObserver()}disconnectedCallback(){var e;this.unsubscribe.forEach(i=>i()),(e=this.paginationObserver)==null||e.disconnect()}render(){return c`
      <wui-grid
        data-scroll=${!this.loading}
        .padding=${["0","s","s","s"]}
        columnGap="xxs"
        rowGap="l"
        justifyContent="space-between"
      >
        ${this.loading?this.shimmerTemplate(16):this.walletsTemplate()}
        ${this.paginationLoaderTemplate()}
      </wui-grid>
    `}async initialFetch(){var i;this.loading=!0;const e=(i=this.shadowRoot)==null?void 0:i.querySelector("wui-grid");e&&(await m.fetchWalletsByPage({page:1}),await e.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.loading=!1,e.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}shimmerTemplate(e,i){return[...Array(e)].map(()=>c`
        <wui-card-select-loader type="wallet" id=${w(i)}></wui-card-select-loader>
      `)}walletsTemplate(){var n;const e=((n=this.filteredWallets)==null?void 0:n.length)>0?h.uniqueBy([...this.featured,...this.recommended,...this.filteredWallets],"id"):h.uniqueBy([...this.featured,...this.recommended,...this.wallets],"id");return Ye.markWalletsAsInstalled(e).map(o=>c`
        <w3m-all-wallets-list-item
          @click=${()=>this.onConnectWallet(o)}
          .wallet=${o}
        ></w3m-all-wallets-list-item>
      `)}paginationLoaderTemplate(){const{wallets:e,recommended:i,featured:n,count:o}=m.state,t=window.innerWidth<352?3:4,r=e.length+i.length;let f=Math.ceil(r/t)*t-r+t;return f-=e.length?n.length%t:0,o===0&&n.length>0?null:o===0||[...n,...e,...i].length<o?this.shimmerTemplate(f,Tt):null}createPaginationObserver(){var i;const e=(i=this.shadowRoot)==null?void 0:i.querySelector(`#${Tt}`);e&&(this.paginationObserver=new IntersectionObserver(([n])=>{if(n!=null&&n.isIntersecting&&!this.loading){const{page:o,count:t,wallets:r}=m.state;r.length<t&&m.fetchWalletsByPage({page:o+1})}}),this.paginationObserver.observe(e))}onConnectWallet(e){x.selectWalletConnector(e)}};re.styles=Pi;$e([u()],re.prototype,"loading",void 0);$e([u()],re.prototype,"wallets",void 0);$e([u()],re.prototype,"recommended",void 0);$e([u()],re.prototype,"featured",void 0);$e([u()],re.prototype,"filteredWallets",void 0);re=$e([p("w3m-all-wallets-list")],re);const Di=he`
  wui-grid,
  wui-loading-spinner,
  wui-flex {
    height: 360px;
  }

  wui-grid {
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  wui-loading-spinner {
    justify-content: center;
    align-items: center;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;var ot=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let ve=class extends ${constructor(){super(...arguments),this.prevQuery="",this.prevBadge=void 0,this.loading=!0,this.query=""}render(){return this.onSearch(),this.loading?c`<wui-loading-spinner color="accent-100"></wui-loading-spinner>`:this.walletsTemplate()}async onSearch(){(this.query.trim()!==this.prevQuery.trim()||this.badge!==this.prevBadge)&&(this.prevQuery=this.query,this.prevBadge=this.badge,this.loading=!0,await m.searchWallet({search:this.query,badge:this.badge}),this.loading=!1)}walletsTemplate(){const{search:e}=m.state,i=Ye.markWalletsAsInstalled(e);return e.length?c`
      <wui-grid
        data-testid="wallet-list"
        .padding=${["0","s","s","s"]}
        rowGap="l"
        columnGap="xs"
        justifyContent="space-between"
      >
        ${i.map(n=>c`
            <w3m-all-wallets-list-item
              @click=${()=>this.onConnectWallet(n)}
              .wallet=${n}
              data-testid="wallet-search-item-${n.id}"
            ></w3m-all-wallets-list-item>
          `)}
      </wui-grid>
    `:c`
        <wui-flex
          data-testid="no-wallet-found"
          justifyContent="center"
          alignItems="center"
          gap="s"
          flexDirection="column"
        >
          <wui-icon-box
            size="lg"
            iconColor="fg-200"
            backgroundColor="fg-300"
            icon="wallet"
            background="transparent"
          ></wui-icon-box>
          <wui-text data-testid="no-wallet-found-text" color="fg-200" variant="paragraph-500">
            No Wallet found
          </wui-text>
        </wui-flex>
      `}onConnectWallet(e){x.selectWalletConnector(e)}};ve.styles=Di;ot([u()],ve.prototype,"loading",void 0);ot([y()],ve.prototype,"query",void 0);ot([y()],ve.prototype,"badge",void 0);ve=ot([p("w3m-all-wallets-search")],ve);var Wt=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Xe=class extends ${constructor(){super(...arguments),this.search="",this.onDebouncedSearch=h.debounce(e=>{this.search=e})}render(){const e=this.search.length>=2;return c`
      <wui-flex .padding=${["0","s","s","s"]} gap="xs">
        <wui-search-bar @inputChange=${this.onInputChange.bind(this)}></wui-search-bar>
        <wui-certified-switch
          ?checked=${this.badge}
          @click=${this.onClick.bind(this)}
          data-testid="wui-certified-switch"
        ></wui-certified-switch>
        ${this.qrButtonTemplate()}
      </wui-flex>
      ${e||this.badge?c`<w3m-all-wallets-search
            query=${this.search}
            badge=${w(this.badge)}
          ></w3m-all-wallets-search>`:c`<w3m-all-wallets-list badge=${w(this.badge)}></w3m-all-wallets-list>`}
    `}onInputChange(e){this.onDebouncedSearch(e.detail)}onClick(){if(this.badge==="certified"){this.badge=void 0;return}this.badge="certified",ze.showSvg("Only WalletConnect certified",{icon:"walletConnectBrown",iconColor:"accent-100"})}qrButtonTemplate(){return h.isMobile()?c`
        <wui-icon-box
          size="lg"
          iconSize="xl"
          iconColor="accent-100"
          backgroundColor="accent-100"
          icon="qrCode"
          background="transparent"
          border
          borderColor="wui-accent-glass-010"
          @click=${this.onWalletConnectQr.bind(this)}
        ></wui-icon-box>
      `:null}onWalletConnectQr(){I.push("ConnectingWalletConnect")}};Wt([u()],Xe.prototype,"search",void 0);Wt([u()],Xe.prototype,"badge",void 0);Xe=Wt([p("w3m-all-wallets-view")],Xe);const Ai=C`
  button {
    column-gap: var(--wui-spacing-s);
    padding: 11px 18px 11px var(--wui-spacing-s);
    width: 100%;
    background-color: var(--wui-color-gray-glass-002);
    border-radius: var(--wui-border-radius-xs);
    color: var(--wui-color-fg-250);
    transition:
      color var(--wui-ease-out-power-1) var(--wui-duration-md),
      background-color var(--wui-ease-out-power-1) var(--wui-duration-md);
    will-change: color, background-color;
  }

  button[data-iconvariant='square'],
  button[data-iconvariant='square-blue'] {
    padding: 6px 18px 6px 9px;
  }

  button > wui-flex {
    flex: 1;
  }

  button > wui-image {
    width: 32px;
    height: 32px;
    box-shadow: 0 0 0 2px var(--wui-color-gray-glass-005);
    border-radius: var(--wui-border-radius-3xl);
  }

  button > wui-icon {
    width: 36px;
    height: 36px;
    transition: opacity var(--wui-ease-out-power-1) var(--wui-duration-md);
    will-change: opacity;
  }

  button > wui-icon-box[data-variant='blue'] {
    box-shadow: 0 0 0 2px var(--wui-color-accent-glass-005);
  }

  button > wui-icon-box[data-variant='overlay'] {
    box-shadow: 0 0 0 2px var(--wui-color-gray-glass-005);
  }

  button > wui-icon-box[data-variant='square-blue'] {
    border-radius: var(--wui-border-radius-3xs);
    position: relative;
    border: none;
    width: 36px;
    height: 36px;
  }

  button > wui-icon-box[data-variant='square-blue']::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: inherit;
    border: 1px solid var(--wui-color-accent-glass-010);
    pointer-events: none;
  }

  button > wui-icon:last-child {
    width: 14px;
    height: 14px;
  }

  button:disabled {
    color: var(--wui-color-gray-glass-020);
  }

  button[data-loading='true'] > wui-icon {
    opacity: 0;
  }

  wui-loading-spinner {
    position: absolute;
    right: 18px;
    top: 50%;
    transform: translateY(-50%);
  }
`;var K=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let B=class extends W{constructor(){super(...arguments),this.tabIdx=void 0,this.variant="icon",this.disabled=!1,this.imageSrc=void 0,this.alt=void 0,this.chevron=!1,this.loading=!1}render(){return d`
      <button
        ?disabled=${this.loading?!0:!!this.disabled}
        data-loading=${this.loading}
        data-iconvariant=${te(this.iconVariant)}
        tabindex=${te(this.tabIdx)}
      >
        ${this.loadingTemplate()} ${this.visualTemplate()}
        <wui-flex gap="3xs">
          <slot></slot>
        </wui-flex>
        ${this.chevronTemplate()}
      </button>
    `}visualTemplate(){if(this.variant==="image"&&this.imageSrc)return d`<wui-image src=${this.imageSrc} alt=${this.alt??"list item"}></wui-image>`;if(this.iconVariant==="square"&&this.icon&&this.variant==="icon")return d`<wui-icon name=${this.icon}></wui-icon>`;if(this.variant==="icon"&&this.icon&&this.iconVariant){const e=["blue","square-blue"].includes(this.iconVariant)?"accent-100":"fg-200",i=this.iconVariant==="square-blue"?"mdl":"md",n=this.iconSize?this.iconSize:i;return d`
        <wui-icon-box
          data-variant=${this.iconVariant}
          icon=${this.icon}
          iconSize=${n}
          background="transparent"
          iconColor=${e}
          backgroundColor=${e}
          size=${i}
        ></wui-icon-box>
      `}return null}loadingTemplate(){return this.loading?d`<wui-loading-spinner
        data-testid="wui-list-item-loading-spinner"
        color="fg-300"
      ></wui-loading-spinner>`:d``}chevronTemplate(){return this.chevron?d`<wui-icon size="inherit" color="fg-200" name="chevronRight"></wui-icon>`:null}};B.styles=[O,D,Ai];K([l()],B.prototype,"icon",void 0);K([l()],B.prototype,"iconSize",void 0);K([l()],B.prototype,"tabIdx",void 0);K([l()],B.prototype,"variant",void 0);K([l()],B.prototype,"iconVariant",void 0);K([l({type:Boolean})],B.prototype,"disabled",void 0);K([l()],B.prototype,"imageSrc",void 0);K([l()],B.prototype,"alt",void 0);K([l({type:Boolean})],B.prototype,"chevron",void 0);K([l({type:Boolean})],B.prototype,"loading",void 0);B=K([p("wui-list-item")],B);var Bi=function(a,e,i,n){var o=arguments.length,t=o<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,i):n,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")t=Reflect.decorate(a,e,i,n);else for(var s=a.length-1;s>=0;s--)(r=a[s])&&(t=(o<3?r(t):o>3?r(e,i,t):r(e,i))||t);return o>3&&t&&Object.defineProperty(e,i,t),t};let Et=class extends ${constructor(){var e;super(...arguments),this.wallet=(e=I.state.data)==null?void 0:e.wallet}render(){if(!this.wallet)throw new Error("w3m-downloads-view");return c`
      <wui-flex gap="xs" flexDirection="column" .padding=${["s","s","l","s"]}>
        ${this.chromeTemplate()} ${this.iosTemplate()} ${this.androidTemplate()}
        ${this.homepageTemplate()}
      </wui-flex>
    `}chromeTemplate(){var e;return(e=this.wallet)!=null&&e.chrome_store?c`<wui-list-item
      variant="icon"
      icon="chromeStore"
      iconVariant="square"
      @click=${this.onChromeStore.bind(this)}
      chevron
    >
      <wui-text variant="paragraph-500" color="fg-100">Chrome Extension</wui-text>
    </wui-list-item>`:null}iosTemplate(){var e;return(e=this.wallet)!=null&&e.app_store?c`<wui-list-item
      variant="icon"
      icon="appStore"
      iconVariant="square"
      @click=${this.onAppStore.bind(this)}
      chevron
    >
      <wui-text variant="paragraph-500" color="fg-100">iOS App</wui-text>
    </wui-list-item>`:null}androidTemplate(){var e;return(e=this.wallet)!=null&&e.play_store?c`<wui-list-item
      variant="icon"
      icon="playStore"
      iconVariant="square"
      @click=${this.onPlayStore.bind(this)}
      chevron
    >
      <wui-text variant="paragraph-500" color="fg-100">Android App</wui-text>
    </wui-list-item>`:null}homepageTemplate(){var e;return(e=this.wallet)!=null&&e.homepage?c`
      <wui-list-item
        variant="icon"
        icon="browser"
        iconVariant="square-blue"
        @click=${this.onHomePage.bind(this)}
        chevron
      >
        <wui-text variant="paragraph-500" color="fg-100">Website</wui-text>
      </wui-list-item>
    `:null}onChromeStore(){var e;(e=this.wallet)!=null&&e.chrome_store&&h.openHref(this.wallet.chrome_store,"_blank")}onAppStore(){var e;(e=this.wallet)!=null&&e.app_store&&h.openHref(this.wallet.app_store,"_blank")}onPlayStore(){var e;(e=this.wallet)!=null&&e.play_store&&h.openHref(this.wallet.play_store,"_blank")}onHomePage(){var e;(e=this.wallet)!=null&&e.homepage&&h.openHref(this.wallet.homepage,"_blank")}};Et=Bi([p("w3m-downloads-view")],Et);export{Xe as W3mAllWalletsView,wt as W3mConnectingWcBasicView,Et as W3mDownloadsView};

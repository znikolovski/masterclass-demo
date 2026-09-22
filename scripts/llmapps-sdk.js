/* eslint-disable no-underscore-dangle, max-classes-per-file, class-methods-use-this, object-curly-newline */
/**
 * LLMApps SDK — Lightweight connector for the LLM Apps protocol.
 *
 * Implements the ui/* JSON-RPC 2.0 over postMessage channel between
 * a widget (iframe) and its host (ChatGPT, Claude, VS Code, etc.).
 *
 * Zero dependencies. Works in any browser context.
 *
 * Spec:  https://modelcontextprotocol.github.io/ext-apps
 * Ref:   https://developers.openai.com/apps-sdk/reference
 *
 * ── Standard protocol ──────────────────────────────────────────
 *   ui/initialize                       → app.connect()
 *   ui/notifications/initialized        → (automatic after connect)
 *   ui/notifications/tool-result        → app.toolResult   (Promise)
 *   ui/notifications/tool-input         → app.toolInput    (Promise)
 *   ui/notifications/tool-cancelled     → app.toolCancelled (Promise)
 *   ui/notifications/tool-input-partial → app.onToolInputPartial(cb)
 *   ui/notifications/host-context-changed → app.onContextChange(cb)
 *   ui/resource-teardown                → auto-respond + destroy
 *   tools/call                          → app.callTool(name, args)
 *   resources/read                      → app.readResource(uri)
 *   notifications/message               → app.log(level, message)
 *   ui/message                          → app.sendMessage(text)
 *   ui/update-model-context             → app.updateModelContext(text)
 *   ui/open-link                        → app.openLink(url)
 *   ui/request-display-mode             → app.requestDisplayMode(mode)
 *   ui/notifications/size-changed       → app.reportSize(w, h)
 *                                         app.autoResize(target?)
 *
 * ── Host context (from ui/initialize result) ───────────────────
 *   app.hostContext          → theme, styles, locale, displayMode, ...
 *   app.hostCapabilities     → openLinks, serverTools, logging, ...
 *   app.hostInfo             → { name, version }
 *   app.applyHostStyles()    → inject CSS variables + fonts
 *   app.applyContainerDimensions() → apply sizing CSS
 *
 * ── Vendor extensions (auto-detected) ──────────────────────────
 *   app.chatgpt              → ChatGPT-only APIs (or null)
 *     .widgetState / .setWidgetState(state)
 *     .uploadFile(file) / .getFileDownloadUrl({ fileId })
 *     .requestModal(opts) / .requestClose() / .requestCheckout(opts)
 *     .setOpenInAppUrl(opts) / .view
 *     .requestConnectSheet(opts) — undocumented, ChatGPT-only
 *
 * @example
 *   import { LLMApp } from './llmapps-sdk.js';
 *
 *   const app = new LLMApp({
 *     appInfo: { name: 'ProductShowcase', version: '1.0.0' },
 *     appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
 *   });
 *   await app.connect();
 *
 *   // Host context (standard — works everywhere)
 *   console.log(app.hostContext.theme);   // 'dark'
 *   console.log(app.hostContext.locale);  // 'en-US'
 *   app.applyHostStyles();               // inject CSS variables
 *
 *   // React to context changes (standard)
 *   app.onContextChange(ctx => {
 *     document.body.dataset.theme = ctx.theme;
 *   });
 *
 *   // Tool data
 *   const result = await app.toolResult;
 *   renderUI(result.structuredContent);
 */

const PROTOCOL_VERSION = '2026-01-26';
const LOG_PREFIX = '[LLMApps]';

/**
 * Build the tool-result shape for the ChatGPT-refresh fallback path.
 * window.openai.toolResponseMetadata is NOT the same shape as _meta directly —
 * it's { call_tool_result: { content, structuredContent, isError, _meta, meta } }.
 * Confirmed against a live ChatGPT connector — do not
 * assume toolResponseMetadata IS _meta without unwrapping call_tool_result.
 */
export function _reconnectToolResult (openai) {
  if (!openai?.toolOutput) return null;
  return {
    structuredContent: openai.toolOutput,
    _meta: openai.toolResponseMetadata?.call_tool_result?._meta
  };
}

export function _extractAdobeHandles (toolResult) {
  const handles = toolResult?._meta?.adobe?.handles;
  return Array.isArray(handles) && handles.length > 0 ? handles : null;
}

export function _extractAdobeIdentityMap (toolResult) {
  return toolResult?._meta?.adobe?.identityMap ?? null;
}

export function _extractAdobeOrgId (toolResult) {
  return toolResult?._meta?.adobe?.orgId ?? null;
}

let _alloyLoadPromise = null;

function _isAlloyReady () {
  if (typeof window === 'undefined' || typeof window.alloy !== 'function') {
    return false;
  }
  const queue = window.alloy.q;
  // Standalone Alloy retains the stub queue but replaces its native push
  // method with the command executor before draining queued calls.
  return !Array.isArray(queue) || queue.push !== Array.prototype.push;
}

// Adobe Web SDK (Alloy) inlined at build time by scripts/build-alloy.cjs so this
// file is fully self-contained. This is what makes Edge work even when it's
// enabled AFTER the widget was generated: codegen always ships llmapps-sdk.js,
// so carrying Alloy inside it means there's never a separate alloy-*.min.js that
// could be missing. Empty in source; the fetch fallback below keeps an unbuilt
// checkout (dev/tests) working. Do not edit the two lines between the markers by
// hand — the build regenerates them.
/* __ALLOY_BASE_INLINE__ */
const ALLOY_BASE_INLINE = "!function(w,names){names.forEach(function(name){if(!w[name]){(w.__alloyNS=w.__alloyNS||[]).push(name);w[name]=function(){var args=arguments;return new Promise(function(resolve,reject){w[name].q.push([resolve,reject,args])})};w[name].q=[]}})}(window,[\"alloy\"]);\n";
/* __ALLOY_STANDALONE_INLINE__ */
const ALLOY_STANDALONE_INLINE = "/**\n * Copyright 2019 Adobe. All rights reserved.\n * This file is licensed to you under the Apache License, Version 2.0 (the \"License\");\n * you may not use this file except in compliance with the License. You may obtain a copy\n * of the License at http://www.apache.org/licenses/LICENSE-2.0\n *\n * Unless required by applicable law or agreed to in writing, software distributed under\n * the License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS\n * OF ANY KIND, either express or implied. See the License for the specific language\n * governing permissions and limitations under the License.\n */\n\n!function(){\"use strict\";var e=e=>null==e,t=t=>!e(t)&&!Array.isArray(t)&&\"object\"==typeof t;const n=e=>{const t=(e+\"=\".repeat((4-e.length%4)%4)).replace(/-/g,\"+\").replace(/_/g,\"/\"),n=atob(t);return Uint8Array.from(n,e=>e.codePointAt(0)??0)},r=(e,t={})=>{const{urlSafe:n=!1}=t||{},r=btoa(String.fromCharCode(...e));return n?r.replace(/\\+/g,\"-\").replace(/\\//g,\"_\").replace(/=/g,\"\"):r},o=[\"__proto__\",\"constructor\",\"prototype\"],i=(e,n)=>{Object.keys(n).forEach(r=>{o.includes(r)||(t(e[r])&&t(n[r])?i(e[r],n[r]):e[r]=n[r])})};var a=(t,...n)=>{if(e(t))throw new TypeError('deepAssign \"target\" cannot be null or undefined');const r=Object(t);return n.forEach(e=>i(r,Object(e))),r},s=(e,t)=>n=>{const r=t.split(\".\").reduce((e,t)=>(e[t]=e[t]||{},e[t]),e);a(r,n)},c=()=>{const e=[];return{add(t){e.push(t)},call:(...t)=>Promise.all(e.map(e=>e(...t)))}},d=({logger:e,cookieJar:t})=>({...t,set:(n,r,o)=>(e.info(\"Setting cookie\",{name:n,value:r,...o}),t.set(n,r,o))}),l=()=>{const e={};return e.promise=new Promise((t,n)=>{e.resolve=t,e.reject=n}),e};const u=(e,t)=>e===t;var g=(e,t)=>e.appendChild(t);var p=(e,n={},r={},o=[],i=document)=>{const a=i.createElement(e);return Object.keys(n).forEach(e=>{a.setAttribute(e,n[e])}),((e,n)=>{Object.keys(n).forEach(r=>{if(\"style\"===r&&t(n[r])){const t=n[r];Object.keys(t).forEach(n=>{e.style[n]=t[n]})}else e[r]=n[r]})})(a,r),o.forEach(e=>g(a,e)),a};const m=\"BODY\",f=\"IMG\",h=\"STYLE\",y=\"SCRIPT\";var v=({src:e,currentDocument:t=document})=>new Promise((n,r)=>{p(f,{src:e},{onload:n,onerror:r,onabort:r},[],t)}),w=e=>\"function\"==typeof e,I=e=>Array.isArray(e)&&e.length>0,b=e=>Array.isArray(e)?e:null==e?[]:[].slice.call(e);const E=/^\\s*>/;var k=(e,t)=>E.test(t)?b(e.querySelectorAll(`:scope ${t}`)):b(e.querySelectorAll(t)),C=\":shadow\";const S=(e,t)=>{const n=t;if(!n.startsWith(\">\"))return n;return`${e instanceof Element||e instanceof Document?\":scope\":\":host\"} ${n}`};var P=(e,t)=>{const n=(e=>e.split(C))(t);if(n.length<2)return k(e,t);let r=e;for(let e=0;e<n.length;e+=1){const t=n[e].trim();if(\"\"===t&&r.shadowRoot){r=r.shadowRoot;continue}const o=S(r,t),i=k(r,o);if(0===i.length||!i[0]||!i[0].shadowRoot)return i;r=i[0].shadowRoot}},D=(e,t=document)=>-1===e.indexOf(C)?k(t,e):P(t,e);const R=\"MutationObserver\",T={childList:!0,subtree:!0},O=e=>new Error(`Could not find: ${e}`),M=e=>new Promise(e);var N=(e,t=D,n=5e3,r=window,o=document)=>{const i=t(e);return I(i)?Promise.resolve(i):(e=>w(e[R]))(r)?((e,t,n,r,o)=>M((i,a)=>{let s;const c=new e[R](()=>{const e=o(n);I(e)&&(c.disconnect(),s&&clearTimeout(s),i(e))});s=setTimeout(()=>{c.disconnect(),a(O(n))},r),c.observe(t,T)}))(r,o,e,n,t):(e=>\"visible\"===e.visibilityState)(o)?((e,t,n,r)=>M((o,i)=>{const a=()=>{const n=r(t);I(n)?o(n):e.requestAnimationFrame(a)};a(),setTimeout(()=>{i(O(t))},n)}))(r,e,n,t):((e,t,n)=>M((r,o)=>{const i=()=>{const t=n(e);I(t)?r(t):setTimeout(i,100)};i(),setTimeout(()=>{o(O(e))},t)}))(e,n,t)};let A;const x=(e=document)=>{if(void 0===A){const t=e.querySelector(\"[nonce]\");A=t&&(t.nonce||t.getAttribute(\"nonce\"))}return A},q=(e,t={})=>document.querySelector(`script[src=\"${e}\"]`)?(t.onLoad&&t.onLoad(),Promise.resolve()):new Promise((n,r)=>{const{attributes:o={},onLoad:i,onError:a}=t,s=p(\"script\",{type:\"text/javascript\",src:e,async:!0,...x()&&{nonce:x()},...o},{onload:()=>{i&&i(),n()},onerror:()=>{const t=new Error(`Failed to load script: ${e}`);a&&a(t),r(t)}}),c=()=>{const e=document.head||document.body;if(e)g(e,s);else{const e=new Error(\"Neither <head> nor <body> available for script insertion.\");a&&a(e),r(e)}};\"loading\"===document.readyState?document.addEventListener(\"DOMContentLoaded\",c):c()});var $=e=>{const t=e.parentNode;return t?t.removeChild(e):null};const L={name:\"Adobe Alloy\"},_={style:{display:\"none\",width:0,height:0}};var U=({appendNode:e=g,awaitSelector:t=N,createNode:n=p,fireImage:r=v}={})=>{const o=r;let i;const a=({src:o})=>t(m).then(([t])=>i||(i=n(\"IFRAME\",L,_),e(t,i))).then(e=>{const t=e.contentWindow.document;return r({src:o,currentDocument:t})});return e=>{const{hideReferrer:t,url:n}=e;return t?a({src:n}):o({src:n})}},j=e=>t(e)&&0===Object.keys(e).length;const B=(n,r)=>e(n)||!t(n)?n:Object.keys(n).reduce((e,o)=>{const i=n[o];if(t(i)){const t=B(i,r);return j(t)?e:{...e,[o]:t}}return r(i,o)?{...e,[o]:i}:e},{}),F=e=>(e=>{let t=2166136261;const n=(new TextEncoder).encode(e);for(let e=0;e<n.length;e+=1)t^=n[e],t=Math.imul(t,16777619);return t>>>0})(e).toString(16).padStart(8,\"0\");var V=\"com.adobe.alloy.\",H=(e,t)=>e.slice(-t);const z=`${V}getTld`;var J=\"kndctr\",X=e=>e.replace(\"@\",\"_\"),G=(e,t)=>`${J}_${X(e)}_${t}`,Q=(e,t)=>{const n={};return e.forEach(e=>{const r=t(e);n[r]||(n[r]=[]),n[r].push(e)}),n};const W=\"Chrome\",K=\"Edge\",Y=\"EdgeChromium\",Z=\"Firefox\",ee=\"IE\",te=\"Safari\",ne=\"Unknown\";var re=e=>{let t,n=!1;return()=>(n||(n=!0,t=e()),t)};const oe=[W,K,Y,\"IE\",ne];var ie=({getBrowser:e})=>re(()=>oe.includes(e()));var ae=({orgId:e,cookieJar:t})=>{const n=G(e,\"identity\");return()=>Boolean(t.get(n))};var se=({userAgent:e})=>re(()=>((e,t)=>{const n=Object.keys(e);for(let r=0;r<n.length;r+=1){const o=n[r];if(e[o].test(t))return o}return ne})({[K]:/Edge\\/([0-9\\._]+)/,[Y]:/Edg\\/([0-9\\.]+)/,[W]:/(?!Chrom.*OPR)Chrom(?:e|ium)\\/([0-9\\.]+)(:?\\s|$)/,[Z]:/Firefox\\/([0-9\\.]+)(?:\\s|$)/,[ee]:/Trident\\/7\\.0.*rv\\:([0-9\\.]+).*\\).*Gecko$/,[te]:/Version\\/([0-9\\._]+).*Safari/},e));const ce=(e,t,n)=>({getItem(r){try{return e[t].getItem(n+r)}catch{return null}},setItem(r,o){try{return e[t].setItem(n+r,o),!0}catch{return!1}},clear(){try{return Object.keys(e[t]).forEach(r=>{r.startsWith(n)&&e[t].removeItem(r)}),!0}catch{return!1}}});var de=e=>\"boolean\"==typeof e,le=e=>\"number\"==typeof e&&!Number.isNaN(e),ue=e=>{const t=parseInt(e,10);return le(t)&&e===t},ge=e=>\"string\"==typeof e,pe=e=>ge(e)&&e.length>0,me=()=>{};const fe=e=>{const t={},n=e.split(\".\");switch(n.length){case 1:t.subdomain=\"\",t.domain=e,t.topLevelDomain=\"\";break;case 2:t.subdomain=\"\",t.domain=e,t.topLevelDomain=n[1];break;case 3:t.subdomain=\"www\"===n[0]?\"\":n[0],t.domain=e,t.topLevelDomain=n[2];break;case 4:t.subdomain=\"www\"===n[0]?\"\":n[0],t.domain=e,t.topLevelDomain=`${n[2]}.${n[3]}`}return t},he=(e,t=fe)=>{ge(e)||(e=\"\");const n=(e=>{try{const t=new URL(e);let n=t.pathname;return e.endsWith(\"/\")||\"/\"!==n||(n=\"\"),{host:t.hostname,path:n,query:t.search.replace(/^\\?/,\"\"),anchor:t.hash.replace(/^#/,\"\")}}catch{return{host:\"\",path:\"\",query:\"\",anchor:\"\"}}})(e),{host:r,path:o,query:i,anchor:a}=n;return{path:o,query:i,fragment:a,...t(r)}};var ye,ve;function we(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,\"default\")?e.default:e}var Ie=(ve||(ve=1,ye={parse:function(e){return function(e){var t={};if(!e||\"string\"!=typeof e)return t;var n=e.trim().replace(/^[?#&]/,\"\"),r=new URLSearchParams(n),o=r.keys();do{var i=o.next(),a=i.value;if(a){var s=r.getAll(a);1===s.length?t[a]=s[0]:t[a]=s}}while(!1===i.done);return t}(e)},stringify:function(e){return function(e){var t=\"{{space}}\",n=new URLSearchParams;return Object.keys(e).forEach(function(r){var o=e[r];\"string\"==typeof e[r]?o=o.replace(/ /g,t):[\"object\",\"undefined\"].includes(typeof o)&&!Array.isArray(o)&&(o=\"\"),Array.isArray(o)?o.forEach(function(e){n.append(r,e)}):n.append(r,o)}),n.toString().replace(new RegExp(encodeURIComponent(t),\"g\"),\"%20\")}(e)}}),ye),be=we(Ie);const Ee=e=>Array.isArray(e)?e.map(e=>Ee(e)):\"object\"==typeof e&&null!==e?Object.keys(e).sort().reduce((t,n)=>(t[n]=Ee(e[n]),t),{}):e;var ke=e=>Ee(e),Ce=e=>e instanceof Error?e:new Error(e),Se=({error:e,message:t})=>{try{e.message=t}catch{}},Pe=({error:e,message:t})=>{const n=Ce(e),r=`${t}\\nCaused by: ${n.message}`;return Se({error:n,message:r}),n},De=(e,t)=>{if(le(e)||ge(e)){const t=Math.round(Number(e));if(!Number.isNaN(t))return t}return t};const Re=(e,t,n)=>`${e}`.padStart(t,n);const Te=[];for(let e=0;e<256;++e)Te.push((e+256).toString(16).slice(1));const Oe=new Uint8Array(16);function Me(e,t,n){return t||e||!crypto.randomUUID?function(e,t,n){e=e||{};const r=e.random??e.rng?.()??crypto.getRandomValues(Oe);if(r.length<16)throw new Error(\"Random bytes length must be >= 16\");if(r[6]=15&r[6]|64,r[8]=63&r[8]|128,t){if((n=n||0)<0||n+16>t.length)throw new RangeError(`UUID byte range ${n}:${n+15} is out of buffer bounds`);for(let e=0;e<16;++e)t[n+e]=r[e];return t}return function(e,t=0){return(Te[e[t+0]]+Te[e[t+1]]+Te[e[t+2]]+Te[e[t+3]]+\"-\"+Te[e[t+4]]+Te[e[t+5]]+\"-\"+Te[e[t+6]]+Te[e[t+7]]+\"-\"+Te[e[t+8]]+Te[e[t+9]]+\"-\"+Te[e[t+10]]+Te[e[t+11]]+Te[e[t+12]]+Te[e[t+13]]+Te[e[t+14]]+Te[e[t+15]]).toLowerCase()}(r)}(e,t,n):crypto.randomUUID()}const Ne=e=>function(t,n){return null==t?t:e.call(this,t,n)},Ae=(e,t)=>function(n,r){return t.call(this,e.call(this,n,r),r)},xe=(e,t)=>function(n,r){const o=[],i=[e,t].reduce((e,t)=>{try{return t.call(this,e,r)}catch(t){return o.push(t),e}},n);if(o.length)throw new Error(o.join(\"\\n\"));return i},qe=(e,t,n)=>Object.assign(Ae(e,t),e,n),$e=(e,t,n)=>Object.assign(Ae(e,Ne(t)),e,n),Le=(e,t,n,r)=>{if(!e)throw new Error(`'${n}': Expected ${r}, but got ${JSON.stringify(t)}.`)};var _e=(e,t)=>(Le(de(e),e,t,\"true or false\"),e),Ue=(e,t)=>(Le(w(e),e,t,\"a function\"),e),je=(e,t)=>function(n,r){let o;const i=e.find(e=>{try{return o=e.call(this,n,r),!0}catch{return!1}});return Le(i,n,r,t),o},Be=e=>function(t,n){Le(Array.isArray(t),t,n,\"an array\");const r=[],o=t.map((o,i)=>{try{return e.call(this,o,`${n}[${i}]`,t)}catch(e){return void r.push(e.message)}});if(r.length)throw new Error(r.join(\"\\n\"));return o},Fe=(e=\"This field has been deprecated\")=>function(t,n){let r=e;return void 0!==t&&(n&&(r=`'${n}': ${r}`),this&&this.logger&&this.logger.warn(r)),t},Ve=e=>function(n,r){Le(t(n),n,r,\"an object\");const o=[],i={};if(Object.keys(n).forEach(t=>{const a=n[t],s=r?`${r}.${t}`:t;try{const n=e.call(this,a,s);void 0!==n&&(i[t]=n)}catch(e){o.push(e.message)}}),o.length)throw new Error(o.join(\"\\n\"));return i},He=(e,t)=>(n,r)=>(Le(n>=t,n,r,`${e} greater than or equal to ${t}`),n),ze=e=>(n,r)=>(t(n)?Le(!j(n),n,r,e):Le(n.length>0,n,r,e),n),Je=e=>function(n,r){Le(t(n),n,r,\"an object\");const o=[],i={};if(Object.keys(e).forEach(t=>{const a=n[t],s=e[t],c=r?`${r}.${t}`:t;try{const e=s.call(this,a,c);void 0!==e&&(i[t]=e)}catch(e){o.push(e.message)}}),Object.keys(n).forEach(e=>{Object.prototype.hasOwnProperty.call(i,e)||(i[e]=n[e])}),o.length)throw new Error(o.join(\"\\n\"));return i},Xe=(e,n,r)=>function(o,i){Le(t(o),o,i,\"an object\");const{[e]:a,[r]:s,...c}=o,d=n(a,i);if(void 0!==d){let t=`The field '${e}' is deprecated. Use '${r}' instead.`;if(i&&(t=`'${i}': ${t}`),void 0!==s&&s!==d)throw new Error(t);this&&this.logger&&this.logger.warn(t)}return{[r]:s||d,...c}},Ge=()=>(e,t)=>(Le((e=>{const t=Object.create(null);for(let n=0;n<e.length;n+=1){const r=e[n];if(r in t)return!1;t[r]=!0}return!0})(e),e,t,\"array values to be unique\"),e);const Qe=/^[a-z0-9.-]{1,}$/i;var We=(e,t)=>(Le(Qe.test(e),e,t,\"a valid domain\"),e),Ke=(e,t)=>(Le(ue(e),e,t,\"an integer\"),e),Ye=(e,t)=>(Le(le(e),e,t,\"a number\"),e),Ze=(e,t)=>(Le((e=>{try{return null!==RegExp(e)}catch{return!1}})(e),e,t,\"a regular expression\"),e),et=(e,t)=>{if(null==e)throw new Error(`'${t}' is a required option`);return e},tt=(e,t)=>(Le(ge(e),e,t,\"a string\"),e);const nt=e=>e;nt.default=function(e){return qe(this,(e=>t=>null==t?e:t)(e))},nt.required=function(){return qe(this,et)},nt.deprecated=function(e){return qe(this,Fe(e))};const rt=function(){return $e(this,We)},ot=function(e){return $e(this,He(\"an integer\",e))},it=function(e){return $e(this,He(\"a number\",e))},at=function(e){return $e(this,(t=\"a number\",n=e,(e,r)=>(Le(e<=n,e,r,`${t} less than or equal to ${n}`),e)));var t,n},st=function(){return $e(this,Ke,{minimum:ot})},ct=function(){return $e(this,ze(\"a non-empty string\"))},dt=function(){return $e(this,ze(\"a non-empty array\"))},lt=function(){return $e(this,ze(\"a non-empty object\"))},ut=function(){return $e(this,Ze)},gt=function(e){return $e(this,(e=>(t,n)=>(Le(e.test(t),t,n,`does not match the ${e.toString()}`),t))(e))},pt=function(){return $e(this,(()=>{const e=[];return(t,n)=>(Le(-1===e.indexOf(t),t,n,\"a unique value across instances\"),e.push(t),t)})())},mt=function(){return $e(this,Ge())},ft=e=>({noUnknownFields:function(){return $e(this,(e=>(t,n)=>{const r=[];if(Object.keys(t).forEach(t=>{if(!e[t]){const e=n?`${n}.${t}`:t;r.push(`'${e}': Unknown field.`)}}),r.length)throw new Error(r.join(\"\\n\"));return t})(e))},nonEmpty:lt,concat:function(t){const n={...e,...t.schema};return $e(this,t,ft(n))},renamed:function(e,t,n){return r=this,o=Xe(e,t,n),Object.assign(xe(Ne(o),r),r,i);var r,o,i},schema:e}),ht=function(e,t){return qe(this,je(e,t))}.bind(nt),yt=function(){return this}.bind(nt),vt=function(e){return $e(this,Be(e),{nonEmpty:dt,uniqueItems:mt})}.bind(nt),wt=function(){return $e(this,_e)}.bind(nt),It=function(){return $e(this,Ue)}.bind(nt),bt=function(e){return $e(this,(e=>(t,n)=>(Le(t===e,t,n,`${e}`),t))(e))}.bind(nt),Et=function(){return $e(this,Ye,{minimum:it,maximum:at,integer:st,unique:pt})}.bind(nt),kt=function(e){return $e(this,Ve(e),{nonEmpty:lt})}.bind(nt),Ct=function(e){return $e(this,Je(e),ft(e))}.bind(nt),St=function(){return $e(this,tt,{regexp:ut,domain:rt,nonEmpty:ct,unique:pt,matches:gt})}.bind(nt),Pt=function(...e){return ht(e.map(bt),`one of these values: ${JSON.stringify(e)}`)};var Dt=kt(vt(Ct({authenticatedState:Pt(\"ambiguous\",\"authenticated\",\"loggedOut\"),id:St(),namespace:Ct({code:St()}).noUnknownFields(),primary:wt(),xid:St()}).noUnknownFields()).required()),Rt=Ct({});const Tt=[\"onComponentsRegistered\",\"onBeforeEvent\",\"onBeforeRequest\",\"onResponse\",\"onRequestFailure\",\"onClick\",\"onDecision\"];var Ot=e=>Tt.reduce((t,n)=>{var r;return t[n]=(r=((e,t)=>(...n)=>Promise.all(e.getLifecycleCallbacks(t).map(e=>new Promise(t=>{t(e(...n))}))))(e,n),(...e)=>Promise.resolve().then(()=>r(...e))),t},{});const Mt=(e,t)=>(...n)=>{let r;try{r=e(...n)}catch(e){throw Pe({error:e,message:t})}return r instanceof Promise&&(r=r.catch(e=>{throw Pe({error:e,message:t})})),r};var Nt=()=>{const e={},t={},n={};return{register(r,o){const{commands:i,lifecycle:a}=o;((e,n={})=>{const r=(o=Object.keys(t),i=Object.keys(n),o.filter(e=>i.includes(e)));var o,i;if(r.length)throw new Error(`[ComponentRegistry] Could not register ${e} because it has existing command(s): ${r.join(\",\")}`);Object.keys(n).forEach(r=>{const o=n[r];o.commandName=r,o.run=Mt(o.run,`[${e}] An error occurred while executing the ${r} command.`),t[r]=o})})(r,i),((e,t={})=>{Object.keys(t).forEach(r=>{n[r]=n[r]||[],n[r].push(Mt(t[r],`[${e}] An error occurred while executing the ${r} lifecycle hook.`))})})(r,a),e[r]=o},getCommand:e=>t[e],getCommandNames:()=>Object.keys(t),getLifecycleCallbacks:e=>n[e]||[],getComponentNames:()=>Object.keys(e)}};const At=(e,t)=>{let n,r=0,o=0;do{if(t<0||t+o>=e.length)throw new Error(\"Invalid varint: buffer ended unexpectedly\");if(n=e[t+o],r|=(127&n)<<7*o,o+=1,o>10)throw new Error(\"Invalid varint: too long\")}while(128&n);return{value:r,length:o}},xt=Object.freeze({VARINT:0,I64:1,LEN:2,SGROUP:3,EGROUP:4,I32:5});var qt=({orgId:e,cookieJar:t,logger:r})=>{const o=G(e,\"identity\");return()=>{const e=t.get(o);if(!e)return null;try{const t=decodeURIComponent(e).replace(/_/g,\"/\").replace(/-/g,\"+\");return(e=>{let t=0,n=null;for(;t<e.length&&!n;){const{value:r,length:o}=At(e,t);t+=o;const i=7&r;if(1==r>>3){if(i===xt.LEN){const r=At(e,t);return t+=r.length,n=(new TextDecoder).decode(e.slice(t,t+r.value)),n}}else switch(i){case xt.VARINT:t+=At(e,t).length;break;case xt.I64:t+=8;break;case xt.LEN:{const n=At(e,t);t+=n.length+n.value;break}case xt.SGROUP:case xt.EGROUP:break;case xt.I32:t+=4;break;default:throw new Error(`Malformed kndctr cookie. Unknown wire type: ${i}`)}}throw new Error(\"No ECID found in cookie.\")})(n(t))}catch(e){return r.warn(`Unable to decode ECID from ${o} cookie`,e),null}}},$t=({logger:e,loggingCookieJar:t,config:n})=>{let r=null;const o=new Promise(e=>{r=e}),i=qt({orgId:n.orgId,cookieJar:t,logger:e});return{initialize(){i()&&this.setIdentityAcquired()},setIdentityAcquired(){r()},awaitIdentity:()=>o,getEcidFromCookie:()=>i()}};const Lt=\"in\",_t=\"out\",Ut=\"pending\",jt=\"disabled\",Bt=\"wait\",Ft=\"auto\",Vt=\"general\",Ht=\"declinedConsent\",zt=\"default\",Jt=\"initial\",Xt=\"new\",Gt=e=>{const t=new Error(e);return t.code=Ht,t.message=e,t};var Qt=({logger:e})=>{const t=[],n=()=>Promise.resolve(),r=()=>Promise.resolve(),o=()=>Promise.reject(Gt(\"No consent preferences have been set.\")),i=()=>Promise.reject(Gt(\"The user declined consent.\")),a=e=>{if(e)return Promise.reject(new Error(\"Consent is pending.\"));const n=l();return t.push(n),n.promise};return{in(o){o===zt?this.awaitConsent=n:(o===Jt?e.info(\"Loaded user consent preferences. The user previously consented.\"):o===Xt&&this.awaitConsent!==r&&e.info(\"User consented.\"),(()=>{for(;t.length;)t.shift().resolve()})(),this.awaitConsent=r)},out(n){n===zt?(e.warn(\"User consent preferences not found. Default consent of out will be used.\"),this.awaitConsent=o):(n===Jt?e.warn(\"Loaded user consent preferences. The user previously declined consent.\"):n===Xt&&this.awaitConsent!==i&&e.warn(\"User declined consent.\"),(()=>{for(;t.length;)t.shift().reject(Gt(\"The user declined consent.\"))})(),this.awaitConsent=i)},pending(t){t===zt&&e.info(\"User consent preferences not found. Default consent of pending will be used. Some commands may be delayed.\"),this.awaitConsent=a},awaitConsent:()=>Promise.resolve(),withConsent(){return this.awaitConsent(!0)},current(){switch(this.awaitConsent){case n:return{state:\"in\",wasSet:!1};case r:return{state:\"in\",wasSet:!0};case o:return{state:\"out\",wasSet:!1};case i:return{state:\"out\",wasSet:!0};case a:return{state:\"pending\",wasSet:!1};default:return{state:\"in\",wasSet:!1}}}}};const Wt=e=>e&&e._experience&&e._experience.decisioning&&I(e._experience.decisioning.propositions)?e._experience.decisioning.propositions:[];var Kt=()=>{const e={},t=Date.now();let n,r,o=!1,i=!1,s=!0;const c=e=>{if(i)throw new Error(`${e} cannot be called after event is finalized.`)},d={hasQuery(){return Object.prototype.hasOwnProperty.call(this.getContent(),\"query\")},getContent(){const t=JSON.parse(JSON.stringify(e));return n&&a(t,{xdm:n}),r&&a(t,{data:r}),t},setUserXdm(e){c(\"setUserXdm\"),n=e},setUserData(e){c(\"setUserData\"),r=e},mergeXdm(t){c(\"mergeXdm\"),t&&a(e,{xdm:t})},mergeData(t){c(\"mergeData\"),t&&a(e,{data:t})},mergeMeta(t){c(\"mergeMeta\"),t&&a(e,{meta:t})},mergeQuery(t){c(\"mergeQuery\"),t&&a(e,{query:t})},documentMayUnload(){o=!0},finalize(t){if(i)return;const o=((e,t=u)=>e.filter((n,r)=>((e,t,n)=>{for(let r=0;r<e.length;r+=1)if(n(e[r],t))return r;return-1})(e,n,t)===r))([...Wt(n),...Wt(e.xdm)],(e,t)=>e===t||e.id&&t.id&&e.id===t.id&&e.scope&&t.scope&&e.scope===t.scope);if(n&&this.mergeXdm(n),o.length>0&&(e.xdm._experience.decisioning.propositions=o),r&&d.mergeData(r),i=!0,t){s=!1;const n={xdm:e.xdm||{},data:e.data||{}},r=t(n);s=!1!==r,e.xdm=n.xdm||{},e.data=n.data||{},j(e.xdm)&&delete e.xdm,j(e.data)&&delete e.data}},getDocumentMayUnload:()=>o,getCreatedAt:()=>t,isEmpty:()=>j(e)&&(!n||j(n))&&(!r||j(r)),shouldSend:()=>s,getViewName(){if(n&&n.web&&n.web.webPageDetails)return n.web.webPageDetails.viewName},getUserIdentityMap:()=>n?.identityMap,toJSON(){if(!i)throw new Error(\"toJSON called before finalize\");return e}};return d};const Yt=\"configure\",Zt=\"setDebug\";var en=({logger:e,configureCommand:n,setDebugCommand:r,handleError:o,validateCommandOptions:i})=>{let a;return(s,c={})=>new Promise(t=>{const o=((t,o)=>{let s;if(t===Yt){if(a)throw new Error(\"The library has already been configured and may only be configured once.\");s=()=>(a=n(o),a.then(()=>{}))}else{if(!a)throw new Error(\"The library must be configured first. Please do so by executing the configure command.\");s=t===Zt?()=>{const e=Ct({enabled:wt().required()}).noUnknownFields(),t=i({command:{commandName:Zt,optionsValidator:e},options:o});r(t)}:()=>a.then(e=>{const n=e.getCommand(t);if(!n||!w(n.run)){const n=[Yt,Zt].concat(e.getCommandNames()).join(\", \");throw new Error(`The ${t} command does not exist. List of available commands: ${n}.`)}const r=i({command:n,options:o});return n.run(r)},()=>(e.warn(`An error during configuration is preventing the ${t} command from executing.`),new Promise(()=>{})))}return s})(s,c);e.logOnBeforeCommand({commandName:s,options:c}),t(o())}).catch(e=>o(e,`${s} command`)).catch(t=>{throw e.logOnCommandRejected({commandName:s,options:c,error:t}),t}).then(n=>{const r=t(n)?n:{};return e.logOnCommandResolved({commandName:s,options:c,result:r}),r})};const tn=\"https://adobe.ly/3sHgQHb\";var nn=({command:e,options:t})=>{const{commandName:n,documentationUri:r=tn,optionsValidator:o}=e;let i=t;if(o)try{i=o(t)}catch(e){throw new Error(`Invalid ${n} command options:\\n\\t - ${e} For command documentation see: ${r}`,{cause:e})}return i};var rn=({options:e,componentCreators:t,coreConfigValidators:n,createConfig:r,logger:o,setDebugEnabled:i})=>{const a=(e=>{const t=[],n={get enabled(){return e.enabled},flush(){t.forEach(({method:t,args:n})=>e[t](...n))}};return Object.keys(e).filter(t=>\"function\"==typeof e[t]).forEach(e=>{n[e]=(...n)=>{t.push({method:e,args:n})}}),n})(o),s=t.map(({configValidators:e})=>e).filter(e=>e).reduce((e,t)=>e.concat(t),n),c=r((({combinedConfigValidator:e,options:t,logger:n})=>{try{return e.noUnknownFields().required().call({logger:n},t)}catch(e){throw new Error(`Resolve these configuration problems:\\n\\t - ${e.message.split(\"\\n\").join(\"\\n\\t - \")}\\nFor configuration documentation see: https://adobe.ly/3sHh553`,{cause:e})}})({combinedConfigValidator:s,options:e,logger:a}));i(c.debugEnabled,{fromConfig:!0}),a.flush();const d=((e,t,n)=>n.reduce((n,{buildOnInstanceConfiguredExtraParams:r})=>(r&&(n={...n,...r({config:e,logger:t})}),n),{}))(c,o,t);return o.logOnInstanceConfigured({...d,config:c}),c};const on=e=>({...e});var an=({errorPrefix:e,logger:t})=>(n,r)=>{const o=Ce(n);if(o.code===Ht)return t.warn(`The ${r} could not fully complete. ${o.message}`),{};throw Se({error:o,message:`${e} ${o.message}`}),o},sn=({getDebugEnabled:e,console:t,getMonitors:n,context:r})=>{let o=`[${r.instanceName}]`;r.componentName&&(o+=` [${r.componentName}]`);const i=(e,t)=>{const o=n();if(o.length>0){const n={...r,...t};o.forEach(t=>{t[e]&&t[e](n)})}},a=(n,...r)=>{i(\"onBeforeLog\",{level:n,arguments:r}),e()&&t[n](o,...r)};return{get enabled(){return n().length>0||e()},logOnInstanceCreated(e){i(\"onInstanceCreated\",e),a(\"info\",\"Instance initialized.\")},logOnInstanceConfigured(e){i(\"onInstanceConfigured\",e),a(\"info\",\"Instance configured. Computed configuration:\",e.config)},logOnBeforeCommand(e){i(\"onBeforeCommand\",e),a(\"info\",`Executing ${e.commandName} command. Options:`,e.options)},logOnCommandResolved(e){i(\"onCommandResolved\",e),a(\"info\",`${e.commandName} command resolved. Result:`,e.result)},logOnCommandRejected(e){i(\"onCommandRejected\",e),a(\"error\",`${e.commandName} command was rejected. Error:`,e.error)},logOnBeforeNetworkRequest(e){i(\"onBeforeNetworkRequest\",e),a(\"info\",`Request ${e.requestId}: Sending request.`,e.payload)},logOnNetworkResponse(e){i(\"onNetworkResponse\",e);const t=e.parsedBody||e.body?\"response body:\":\"no response body.\";a(\"info\",`Request ${e.requestId}: Received response with status code ${e.statusCode} and ${t}`,e.parsedBody||e.body)},logOnNetworkError(e){i(\"onNetworkError\",e),a(\"error\",`Request ${e.requestId}: Network request failed.`,e.error)},logOnContentHiding(e){i(\"onContentHiding\",{status:e.status}),a(e.logLevel,e.message)},logOnContentRendering(e){i(\"onContentRendering\",{status:e.status,payload:e.detail}),a(e.logLevel,e.message)},info:a.bind(null,\"info\"),warn:a.bind(null,\"warn\"),error:a.bind(null,\"error\")}},cn=\"__view__\",dn=e=>(t,n)=>{e.xdm=e.xdm||{},e.xdm.identityMap=e.xdm.identityMap||{},e.xdm.identityMap[t]=e.xdm.identityMap[t]||[],e.xdm.identityMap[t].push(n)},ln=e=>{const{payload:t,getAction:n,getUseSendBeacon:r,datastreamIdOverride:o,edgeSubPath:i,requestParams:a={}}=e,s=Me();let c=!1,d=!1;return{getId:()=>s,getPayload:()=>t,getAction:()=>n({isIdentityEstablished:d}),getDatastreamIdOverride:()=>o,getUseSendBeacon:()=>r({isIdentityEstablished:d}),getEdgeSubPath:()=>i||\"\",getUseIdThirdPartyDomain:()=>c,setUseIdThirdPartyDomain(){c=!0},setIsIdentityEstablished(){d=!0},getRequestParams:()=>a}},un=({payload:e,datastreamIdOverride:t})=>{const n=({isIdentityEstablished:t})=>e.getDocumentMayUnload()&&t;return ln({payload:e,getAction:({isIdentityEstablished:e})=>n({isIdentityEstablished:e})?\"collect\":\"interact\",getUseSendBeacon:n,datastreamIdOverride:t})};var gn=t=>{const{content:n,addIdentity:r,hasIdentity:o}=t,i=((e,t)=>n=>{const r=t.split(\".\").reduce((e,t)=>(e[t]=e[t]||{},e[t]),e);Object.assign(r,n)})(n,\"meta.configOverrides\");return{mergeMeta:s(n,\"meta\"),mergeState:s(n,\"meta.state\"),mergeQuery:s(n,\"query\"),mergeConfigOverride:e=>i(e),finalizeConfigOverrides:()=>{if(n.meta?.configOverrides){const t=(t=>{if(e(t)||\"object\"!=typeof t)return null;const n=B(t,(t,n)=>!(e(t)||(!de(t)||\"enabled\"===n&&!1!==t)&&!le(t)&&!pe(t)&&!I(t)));return j(n)?null:n})(n.meta.configOverrides);null===t?delete n.meta.configOverrides:n.meta.configOverrides=t}},addIdentity:r,hasIdentity:o,toJSON:()=>n}},pn=e=>t=>void 0!==(e.xdm&&e.xdm.identityMap&&e.xdm.identityMap[t]),mn=()=>{const e={};return{...gn({content:e,addIdentity:dn(e),hasIdentity:pn(e)}),addEvent:t=>{e.events=e.events||[],e.events.push(t)},getEvents:()=>e.events||[],getDocumentMayUnload:()=>(e.events||[]).some(e=>e.getDocumentMayUnload())}},fn=({localConfigOverrides:e,globalConfigOverrides:t,payload:n})=>{const r={payload:n},{datastreamId:o,...i}=e||{};return o&&(r.datastreamIdOverride=o),t&&!j(t)&&n.mergeConfigOverride(t),i&&!j(i)&&n.mergeConfigOverride(i),n.finalizeConfigOverrides(),r};const hn=\"clientId\";const yn=\"Event was canceled because the onBeforeEventSend callback returned false.\";var vn=({orgId:e,targetMigrationEnabled:t})=>n=>((e,t)=>0===t.indexOf(`${J}_${X(e)}_`))(e,n)||\"at_qa_mode\"===n||t&&\"mbox\"===n,wn=\"alloy_debug\";var In=e=>((...e)=>e.length<2?Object.assign(...e):e.reduce((e,n)=>(t(n)&&Object.keys(n).forEach(t=>{Array.isArray(n[t])?Array.isArray(e[t])?e[t].push(...n[t]):e[t]=[...n[t]]:e[t]=n[t]}),e)))({},...e.shift()||[],...e.shift()||[],...e),bn=e=>t=>{const n=()=>{throw t};return e.call({error:t}).then(n,n)};const En=e=>{if(\"function\"!=typeof e.getEvents)return;const t=e.getEvents();if(0===t.length)return;const n=Math.min(...t.map(e=>e.getCreatedAt()));return r=Date.now()-n,o=0,i=3e5,Math.max(o,Math.min(r,i));var r,o,i};const kn=\"The server responded with a\";var Cn=({orgId:e,cookieJar:t})=>{const n=G(e,\"cluster\");return()=>t.get(n)||(()=>{const e=t.get(\"mboxEdgeCluster\");if(e)return`t${e}`})()};const Sn=[429,503,502,504];var Pn=({response:e,retriesAttempted:t})=>t<3&&Sn.includes(e.statusCode);var Dn=({response:e,retriesAttempted:t})=>{let n=(e=>{const t=e.getHeader(\"Retry-After\");let n;if(t){const e=parseInt(t,10);n=ue(e)?1e3*e:Math.max(0,new Date(t).getTime()-(new Date).getTime())}return n})(e);return void 0===n&&(n=(e=>{const t=1e3+1e3*e,n=.3*t,r=t-n,o=t+n;return Math.round(r+Math.random()*(o-r))})(t)),n};const Rn=({eventManager:e,logger:t})=>({commands:{sendEvent:{documentationUri:\"https://adobe.ly/3GQ3Q7t\",optionsValidator:e=>(({options:e})=>Ct({type:St(),xdm:Ct({eventType:St(),identityMap:Dt}),data:Ct({}),documentUnloading:wt(),renderDecisions:wt(),decisionScopes:vt(St()).uniqueItems(),personalization:Ct({decisionScopes:vt(St()).uniqueItems(),surfaces:vt(St()).uniqueItems(),sendDisplayEvent:wt().default(!0),includeRenderedPropositions:wt().default(!1),defaultPersonalizationEnabled:wt(),decisionContext:Ct({})}).default({sendDisplayEvent:!0}),datasetId:St(),mergeId:St(),edgeConfigOverrides:Rt,advertising:Ct({handleAdvertisingData:Pt(jt,Bt,Ft).default(jt)})}).required().noUnknownFields()(e))({options:e}),run:n=>{const{xdm:r,data:o,documentUnloading:i,type:s,mergeId:c,datasetId:d,edgeConfigOverrides:l,...u}=n,g=e.createEvent();return i&&g.documentMayUnload(),g.setUserXdm(r),g.setUserData(o),s&&g.mergeXdm({eventType:s}),c&&g.mergeXdm({eventMergeId:c}),l&&(u.edgeConfigOverrides=l),d&&(t.warn(\"The 'datasetId' option has been deprecated. Please use 'edgeConfigOverrides.com_adobe_experience_platform.datasets.event.datasetId' instead.\"),u.edgeConfigOverrides=l||{},a(u.edgeConfigOverrides,{com_adobe_experience_platform:{datasets:{event:{datasetId:d}}}})),e.sendEvent(g,u)}},applyResponse:{documentationUri:\"\",optionsValidator:e=>(({options:e})=>Ct({renderDecisions:wt(),responseHeaders:kt(St().required()),responseBody:Ct({handle:vt(Ct({type:St().required(),payload:yt().required()})).required()}).required(),personalization:Ct({sendDisplayEvent:wt().default(!0),decisionContext:Ct({})}).default({sendDisplayEvent:!0})}).noUnknownFields()(e))({options:e}),run:t=>{const{renderDecisions:n=!1,decisionContext:r={},responseHeaders:o={},responseBody:i={handle:[]},personalization:a}=t,s=e.createEvent();return e.applyResponse(s,{renderDecisions:n,decisionContext:r,responseHeaders:o,responseBody:i,personalization:a})}}}});Rn.namespace=\"DataCollector\";const Tn=(e,t)=>`ID sync ${t?\"succeeded\":\"failed\"}: ${e.spec.url}`;const On=Ct({thirdPartyCookiesEnabled:wt().default(!0),idMigrationEnabled:wt().default(!0)});var Mn=Ct({url:St().required().nonEmpty(),edgeConfigOverrides:Rt}).required().noUnknownFields(),Nn=\"ECID\",An=\"CORE\",xn=\"adobe_mc\",qn=e=>{try{return decodeURIComponent(e)}catch{return\"\"}};var $n=(e,t)=>{e.addIdentity(Nn,{id:t})},Ln=e=>e.getPayloadsByType(\"identity:result\").reduce((e,t)=>(t.namespace&&t.namespace.code&&(e[t.namespace.code]=t.id),e),{}),_n=({payload:e,datastreamIdOverride:t})=>ln({payload:e,datastreamIdOverride:t,getAction:()=>\"identity/acquire\",getUseSendBeacon:()=>!1}),Un=e=>{const t={query:{identity:{fetch:e}}};return gn({content:t,addIdentity:dn(t),hasIdentity:pn(t)})};const jn=/^([^?#]*)(\\??[^#]*)(#?.*)$/;const Bn=Ct({namespaces:vt(Pt(Nn,An)).nonEmpty().uniqueItems().default([Nn]),edgeConfigOverrides:Rt}).noUnknownFields().default({namespaces:[Nn]});const Fn=({config:e,logger:t,consent:n,fireReferrerHideableImage:r,sendEdgeNetworkRequest:o,apexDomain:i,getBrowser:a,identity:s,platformServices:c})=>{const{orgId:l,thirdPartyCookiesEnabled:u,edgeConfigOverrides:g}=e,p=(({config:e,getEcidFromVisitor:t,apexDomain:n,isPageSsl:r,cookieJar:o})=>{const{idMigrationEnabled:i,orgId:a}=e,s=`AMCV_${a}`,c=()=>{let e=null;const t=o.get(\"s_ecid\")||o.get(s);if(t){const n=/(^|\\|)MCMID\\|(\\d+)($|\\|)/,r=t.match(n);r&&(e=r[2])}return e};return{getEcid(){if(i){const e=c();return e?Promise.resolve(e):t()}return Promise.resolve()},setEcid(e){if(i&&c()!==e){const t=r?{sameSite:\"none\",secure:!0}:{};o.set(s,`MCMID|${e}`,{domain:n,expires:390,...t})}}}})({config:e,getEcidFromVisitor:()=>c.legacy.getEcidFromVisitor({orgId:l,logger:t}),apexDomain:i,cookieJar:d({logger:t,cookieJar:c.cookie}),isPageSsl:c.globals.isPageSsl()}),m=ae({orgId:l,cookieJar:c.cookie}),f=(({sendEdgeNetworkRequest:e,createIdentityRequestPayload:t,createIdentityRequest:n,globalConfigOverrides:r})=>({namespaces:o,edgeConfigOverrides:i}={})=>{const a=fn({payload:t(o),globalConfigOverrides:r,localConfigOverrides:i}),s=n(a);return e({request:s})})({sendEdgeNetworkRequest:o,createIdentityRequestPayload:Un,createIdentityRequest:_n,globalConfigOverrides:g}),h=ie({getBrowser:a}),y=(({thirdPartyCookiesEnabled:e,areThirdPartyCookiesSupportedByDefault:t})=>n=>{e&&t()&&n.setUseIdThirdPartyDomain()})({thirdPartyCookiesEnabled:u,areThirdPartyCookiesSupportedByDefault:h}),v=(({getLegacyEcid:e,addEcidToPayload:t})=>n=>n.hasIdentity(Nn)?Promise.resolve():e().then(e=>{e&&t(n,e)}))({getLegacyEcid:p.getEcid,addEcidToPayload:$n}),w=(({locationSearch:e,locationHash:t,dateProvider:n,orgId:r,logger:o})=>i=>{if(i.hasIdentity(Nn))return;let a=be.parse(e)[xn]??be.parse(t.slice(t.indexOf(\"?\")))[xn];if(void 0===a)return;Array.isArray(a)&&(o.warn(\"Found multiple adobe_mc query string parameters, only using the last one.\"),a=a[a.length-1]);let s=\"\";for(;s!==a;)s=a,a=qn(a);const c=a.split(\"|\").reduce((e,t)=>{const[n,r]=t.split(\"=\");return e[n]=qn(r),e[n]=e[n].replace(/[^a-zA-Z0-9@.]/g,\"\"),e},{}),d=parseInt(c.TS,10),l=c.MCMID,u=qn(c.MCORGID);n().getTime()/1e3<=d+300&&u===r&&l?(o.info(`Found valid ECID identity ${l} from the adobe_mc query string parameter.`),i.addIdentity(Nn,{id:l})):o.info(\"Detected invalid or expired adobe_mc query string parameter.\")})({locationSearch:c.globals.getLocationSearch(),locationHash:c.globals.getLocationHash(),dateProvider:()=>new Date,orgId:l,logger:t}),I=(({doesIdentityCookieExist:e,orgId:t,logger:n})=>({onResponse:r,onRequestFailure:o})=>new Promise((i,a)=>{r(()=>{e()?i():(n.warn(`Identity cookie not found. This could be caused by any of the following issues:\\n\\t* The org ID ${t} configured in Alloy doesn't match the org ID specified in the edge configuration.\\n\\t* Experience edge was not able to set the identity cookie due to domain or cookie restrictions.\\n\\t* The request was canceled by the browser and not fully processed.`),a(new Error(\"Identity cookie not found.\")))}),o(()=>{e()?i():a(new Error(\"Identity cookie not found.\"))})}))({doesIdentityCookieExist:m,orgId:l,logger:t}),b=(({doesIdentityCookieExist:e,setDomainForInitialIdentityPayload:t,addLegacyEcidToPayload:n,awaitIdentityCookie:r,logger:o})=>{let i;const a=e=>(t(e),n(e.getPayload()));return({request:t,onResponse:n,onRequestFailure:s})=>{if(e())return t.setIsIdentityEstablished(),Promise.resolve();if(i){o.info(\"Delaying request while retrieving ECID from server.\");const e=i;return i=e.catch(()=>r({onResponse:n,onRequestFailure:s})),i.catch(()=>{}),e.then(()=>{o.info(\"Resuming previously delayed request.\"),t.setIsIdentityEstablished()}).catch(()=>a(t))}return i=r({onResponse:n,onRequestFailure:s}),i.catch(()=>{}),a(t)}})({doesIdentityCookieExist:m,setDomainForInitialIdentityPayload:y,addLegacyEcidToPayload:v,awaitIdentityCookie:I,logger:t}),E=(({fireReferrerHideableImage:e,logger:t})=>n=>{const r=n.filter(e=>\"url\"===e.type);return r.length?Promise.all(r.map(n=>e(n.spec).then(()=>{t.info(Tn(n,!0))}).catch(()=>{t.warn(Tn(n,!1))}))).then(me):Promise.resolve()})({fireReferrerHideableImage:r,logger:t}),k=(({processIdSyncs:e})=>t=>{e(t.getPayloadsByType(\"identity:exchange\"))})({processIdSyncs:E}),C=(({dateProvider:e,orgId:t})=>(n,r)=>{const o=Math.round(e().getTime()/1e3),i=encodeURIComponent(`TS=${o}|MCMID=${n}|MCORGID=${encodeURIComponent(t)}`),[,a,s,c]=r.match(jn),d=(e=>\"\"===e?\"?\":\"?\"===e?\"\":\"&\")(s);return`${a}${s}${d}adobe_mc=${i}${c}`})({dateProvider:()=>new Date,orgId:l}),S=(({thirdPartyCookiesEnabled:e})=>t=>{const n=Bn(t);if(!e&&n.namespaces.includes(An))throw new Error(`namespaces: The ${An} namespace cannot be requested when third-party cookies are disabled.`);return n})({thirdPartyCookiesEnabled:u}),P=(({thirdPartyCookiesEnabled:e,areThirdPartyCookiesSupportedByDefault:t})=>{const n={identity:{fetch:[Nn]}};return e&&t()&&n.identity.fetch.push(An),e=>{e.mergeQuery(n)}})({thirdPartyCookiesEnabled:u,areThirdPartyCookiesSupportedByDefault:h});return(({addEcidQueryToPayload:e,addQueryStringIdentityToPayload:t,ensureSingleIdentity:n,setLegacyEcid:r,handleResponseForIdSyncs:o,getNamespacesFromResponse:i,getIdentity:a,consent:s,appendIdentityToUrl:c,logger:d,identity:l,getIdentityOptionsValidator:u})=>{let g,p={};return{lifecycle:{onBeforeRequest:({request:r,onResponse:o,onRequestFailure:i})=>(e(r.getPayload()),t(r.getPayload()),n({request:r,onResponse:o,onRequestFailure:i})),onResponse({response:e}){const t=i(e);return g&&g[Nn]||!t||!t[Nn]||r(t[Nn]),t&&Object.keys(t).length>0&&(g={...g,...t}),p={...p,...e.getEdge()},l.getEcidFromCookie()&&l.setIdentityAcquired(),o(e)}},commands:{getIdentity:{optionsValidator:u,run:e=>{const{namespaces:t}=e;return s.awaitConsent().then(()=>{if(g)return;const n=l.getEcidFromCookie();return n&&t.includes(Nn)&&(g||(g={}),g[Nn]=n,1===t.length)?void 0:a(e)}).then(()=>({identity:t.reduce((e,t)=>(e[t]=g[t]||null,e),{}),edge:p}))}},appendIdentityToUrl:{optionsValidator:Mn,run:e=>s.withConsent().then(()=>{if(g)return;const t=l.getEcidFromCookie();return t?(g||(g={}),void(g[Nn]=t)):a(e)}).then(()=>({url:c(g[Nn],e.url)})).catch(t=>(d.warn(`Unable to append identity to url. ${t.message}`),e))}}}})({addEcidQueryToPayload:P,addQueryStringIdentityToPayload:w,ensureSingleIdentity:b,setLegacyEcid:p.setEcid,handleResponseForIdSyncs:k,getNamespacesFromResponse:Ln,getIdentity:f,consent:n,identity:s,appendIdentityToUrl:C,logger:t,getIdentityOptionsValidator:S})};Fn.namespace=\"Identity\",Fn.configValidators=On;var Vn=\"2.35.0\";const Hn=({config:e,componentRegistry:t})=>{const n=[...t.getCommandNames(),Yt,Zt].sort(),r={...e};Object.keys(e).forEach(t=>{const n=e[t];\"function\"==typeof n&&(r[t]=n.toString())});const o=t.getComponentNames();return{version:Vn,configs:r,commands:n,components:o}},zn=({config:e,componentRegistry:t})=>({commands:{getLibraryInfo:{run:()=>({libraryInfo:Hn({config:e,componentRegistry:t})})}}});zn.namespace=\"LibraryInfo\";var Jn=Object.freeze({__proto__:null,dataCollector:Rn,identity:Fn,libraryInfo:zn});const Xn=Ct({debugEnabled:wt().default(!1),datastreamId:St().unique().required(),edgeDomain:St().domain().default(\"edge.adobedc.net\"),edgeBasePath:St().nonEmpty().default(\"ee\"),orgId:St().unique().required(),onBeforeEventSend:It().default(me),edgeConfigOverrides:Rt}).renamed(\"edgeConfigId\",St().unique(),\"datastreamId\"),Gn=({instanceName:e,monitors:t=[],components:n,createPlatformServices:r})=>{const o=r(),i=[...o.globals.getMonitors(),...t],a=(({console:e,createLogger:t,instanceName:n,getMonitors:r,storage:o})=>{let i=!1,a=!1;o.getItem(\"debug\").then(e=>{null===e||a||(i=\"true\"===e,a=!0)}).catch(()=>{});const s=()=>i;return{setDebugEnabled:(e,{fromConfig:t=!1}={})=>{if(t&&a||(i=e),!t){a=!0;const t=o.setItem(\"debug\",String(e));t&&\"function\"==typeof t.then&&t.catch(()=>{})}},logger:t({getDebugEnabled:s,context:{instanceName:n},getMonitors:r,console:e}),createComponentLogger:o=>t({getDebugEnabled:s,context:{instanceName:n,componentName:o},getMonitors:r,console:e})}})({console:globalThis.console,createLogger:sn,instanceName:e,getMonitors:()=>i,storage:o.storage.createNamespacedStorage(`instance.${e}.`).session}),{setDebugEnabled:s,logger:l,createComponentLogger:u}=a,g=o.createNetworkService(l),p=be.parse(o.globals.getLocationSearch());var m;void 0!==p[wn]&&s((m=p[wn],ge(m)&&\"true\"===m.toLowerCase()),{fromConfig:!1});const f=((e,t)=>{let n=\"\";const r=e.toLowerCase().split(\".\");let o=1;for(;o<r.length&&!t.get(z);)o+=1,n=H(r,o).join(\".\"),t.set(z,z,{domain:n});return t.remove(z,{domain:n}),n})(o.globals.getHostname(),o.cookie),{fireReferrerHideableImage:h}=o.globals,y=(({getLocationSearch:e,storage:t})=>{let n=Me();return t.getItem(hn).then(e=>{if(e)n=e;else{const e=t.setItem(hn,n);e&&\"function\"==typeof e.then&&e.catch(()=>{})}}).catch(()=>{}),()=>{const t=be.parse(e()).adb_validation_sessionid;if(!t)return\"\";const r=`${t}|${n}`;return`&${be.stringify({adobeAepValidationToken:r})}`}})({getLocationSearch:()=>o.globals.getLocationSearch(),storage:o.storage.createNamespacedStorage(`instance.${e}.validation.`).persistent}),v=se({userAgent:o.globals.getUserAgent()}),w=Nt(),I=Ot(w),b=n.concat(Object.values(Jn)),E=d({logger:l,cookieJar:o.cookie}),k=an({errorPrefix:`[${e}]`,logger:l}),C=en({logger:l,configureCommand:t=>{const n=rn({options:t,componentCreators:b,coreConfigValidators:Xn,createConfig:on,logger:l,setDebugEnabled:s}),{orgId:r,targetMigrationEnabled:i}=n,a=vn({orgId:r,targetMigrationEnabled:i}),d=(({cookieJar:e,shouldTransferCookie:t,apexDomain:n,dateProvider:r})=>({cookiesToPayload(r,o){const i=\"\"!==n&&o.endsWith(n),a={domain:n,cookiesEnabled:!0};if(!i){const n=e.getAll(),r=Object.keys(n).filter(t).map(e=>({key:e,value:n[e]}));r.length&&(a.entries=r)}r.mergeState(a)},responseToCookies(t){t.getPayloadsByType(\"state:store\").forEach(t=>{const o={domain:n},i=t.attrs&&t.attrs.SameSite&&t.attrs.SameSite.toLowerCase();void 0!==t.maxAge&&(o.expires=new Date(r().getTime()+1e3*t.maxAge)),void 0!==i&&(o.sameSite=i),\"none\"===i&&(o.secure=!0),e.set(t.key,t.value,o)})}}))({cookieJar:E,shouldTransferCookie:a,apexDomain:f,dateProvider:()=>new Date}),p=(({logger:e,sendFetchRequest:t,sendBeaconRequest:n,isRequestRetryable:r,getRequestRetryDelay:o})=>({requestId:i,url:a,payload:s,useSendBeacon:c})=>{const d=JSON.stringify(s),l=JSON.parse(d);e.logOnBeforeNetworkRequest({url:a,requestId:i,payload:l});const u=(s=0)=>(c?n:t)(a,d).then(t=>{if(r({response:t,retriesAttempted:s})){const e=o({response:t,retriesAttempted:s});return new Promise(t=>{setTimeout(()=>{t(u(s+1))},e)})}let n;try{n=JSON.parse(t.body)}catch{}return e.logOnNetworkResponse({requestId:i,url:a,payload:l,...t,parsedBody:n,retriesAttempted:s}),{statusCode:t.statusCode,body:t.body,parsedBody:n,getHeader:t.getHeader}});return u().catch(t=>{throw e.logOnNetworkError({requestId:i,url:a,payload:l,error:t}),Pe({error:t,message:\"Network request failed.\"})})})({logger:l,sendFetchRequest:g.sendFetchRequest,sendBeaconRequest:g.sendBeaconRequest,isRequestRetryable:Pn,getRequestRetryDelay:Dn}),m=(({logger:e})=>t=>{const{statusCode:n,body:r,parsedBody:o}=t;if(n<200||n>=300||!o&&204!==n||o&&!Array.isArray(o.handle)){const e=o?JSON.stringify(o,null,2):r;throw new Error(`${kn} status code ${n} and ${e?`response body:\\n${e}`:\"no response body.\"}`)}if(o){const{warnings:t=[],errors:n=[]}=o;t.forEach(t=>{e.warn(`${kn} warning:`,t)}),n.forEach(t=>{e.error(`${kn} non-fatal error:`,t)})}})({logger:l}),k=(({logger:e})=>t=>{if(t){const n=t.split(\";\");if(n.length>=2&&n[1].length>0)try{const e=parseInt(n[1],10);if(!Number.isNaN(e))return{regionId:e}}catch{}e.warn(`Invalid adobe edge: \"${t}\"`)}return{}})({logger:l}),C=(({extractEdgeInfo:e})=>({content:t={},getHeader:n})=>{const{handle:r=[],errors:o=[],warnings:i=[]}=t;return{getPayloadsByType:e=>r.filter(t=>t.type===e).flatMap(e=>e.payload),getErrors:()=>o,getWarnings:()=>i,getEdge:()=>e(n(\"x-adobe-edge\")),toJSON:()=>t}})({extractEdgeInfo:k}),S=Cn({orgId:r,cookieJar:o.cookie}),P=(({config:e,lifecycle:t,cookieTransfer:n,sendNetworkRequest:r,createResponse:o,processWarningsAndErrors:i,getLocationHint:a,getAssuranceValidationTokenParams:s})=>{const{edgeDomain:d,edgeBasePath:l,datastreamId:u}=e;let g=!1;const p=(e,t)=>{const n=a(),r=n?`${l}/${n}${t.getEdgeSubPath()}`:`${l}${t.getEdgeSubPath()}`,o=t.getDatastreamIdOverride()||u;return o!==u&&t.getPayload().mergeMeta({sdkConfig:{datastream:{original:u}}}),`https://${e}/${r}/v1/${t.getAction()}?configId=${o}&requestId=${t.getId()}${s()}`};return({request:e,runOnResponseCallbacks:a=me,runOnRequestFailureCallbacks:s=me})=>{const l=c();l.add(t.onResponse),l.add(a);const u=c();return u.add(t.onRequestFailure),u.add(s),t.onBeforeRequest({request:e,onResponse:l.add,onRequestFailure:u.add}).then(()=>{const t=g||!e.getUseIdThirdPartyDomain()?d:\"adobedc.demdex.net\",o=p(t,e),i=e.getPayload(),a=En(i);return void 0!==a&&i.mergeMeta({queueTimeMillis:a}),n.cookiesToPayload(i,t),r({requestId:e.getId(),url:o,payload:i,useSendBeacon:e.getUseSendBeacon()})}).then(e=>(i(e),e)).catch(t=>{if(((e,t)=>t.getUseIdThirdPartyDomain()&&(e=>\"TypeError\"===e.name||\"NetworkError\"===e.name||0===e.status)(e))(t,e)){g=!0,e.setUseIdThirdPartyDomain(!1);const t=p(d,e),o=e.getPayload();return n.cookiesToPayload(o,d),r({requestId:e.getId(),url:t,payload:o,useSendBeacon:e.getUseSendBeacon()})}return bn(u)(t)}).then(({parsedBody:e,getHeader:t})=>{const r=o({content:e,getHeader:t});return n.responseToCookies(r),l.call({response:r}).then(In)})}})({config:n,lifecycle:I,cookieTransfer:d,sendNetworkRequest:p,createResponse:C,processWarningsAndErrors:m,getLocationHint:S,getAssuranceValidationTokenParams:y}),D=(({cookieTransfer:e,lifecycle:t,createResponse:n,processWarningsAndErrors:r})=>({request:o,responseHeaders:i,responseBody:a,runOnResponseCallbacks:s=me,runOnRequestFailureCallbacks:d=me})=>{const l=c();l.add(t.onResponse),l.add(s);const u=c();u.add(t.onRequestFailure),u.add(d);const g=e=>i[e];return t.onBeforeRequest({request:o,onResponse:l.add,onRequestFailure:u.add}).then(()=>r({statusCode:200,getHeader:g,body:JSON.stringify(a),parsedBody:a})).catch(bn(u)).then(()=>{const t=n({content:a,getHeader:g});return e.responseToCookies(t),l.call({response:t}).then(In)})})({lifecycle:I,cookieTransfer:d,createResponse:C,processWarningsAndErrors:m}),R=(({generalConsentState:e,logger:t})=>{const n=(n,r)=>{switch(n[Vt]){case Lt:e.in(r);break;case _t:e.out(r);break;case Ut:e.pending(r);break;default:t.warn(`Unknown consent value: ${n[Vt]}`)}};return{initializeConsent(e,t){t[Vt]?n(t,Jt):n(e,zt)},setConsent(e){n(e,Xt)},suspend(){e.pending()},awaitConsent:()=>e.awaitConsent(),withConsent:()=>e.withConsent(),current:()=>e.current()}})({generalConsentState:Qt({logger:l}),logger:l}),T=$t({config:n,logger:l,loggingCookieJar:E});T.initialize();const O=(({config:e,logger:t,lifecycle:n,consent:r,createEvent:o,createDataCollectionRequestPayload:i,createDataCollectionRequest:a,sendEdgeNetworkRequest:s,applyResponse:d})=>{const{onBeforeEventSend:l,edgeConfigOverrides:u}=e;return{createEvent:o,sendEvent(e,o={}){const{edgeConfigOverrides:d,...g}=o,p=fn({payload:i(),localConfigOverrides:d,globalConfigOverrides:u}),m=a(p),f=c(),h=c();return n.onBeforeEvent({...g,event:e,onResponse:f.add,onRequestFailure:h.add}).then(()=>(p.payload.addEvent(e),r.awaitConsent())).then(()=>{try{e.finalize(l)}catch(e){const t=()=>{throw e};return h.add(n.onRequestFailure),h.call({error:e}).then(t,t)}if(!e.shouldSend()){h.add(n.onRequestFailure),t.info(yn);const e=new Error(yn);return h.call({error:e}).then(()=>{})}return s({request:m,runOnResponseCallbacks:f.call,runOnRequestFailureCallbacks:h.call})})},applyResponse(e,t={}){const{renderDecisions:r=!1,decisionContext:o={},responseHeaders:s={},responseBody:l={handle:[]},personalization:u}=t,g=i(),p=a({payload:g}),m=c();return n.onBeforeEvent({event:e,renderDecisions:r,decisionContext:o,decisionScopes:[cn],personalization:u,onResponse:m.add,onRequestFailure:me}).then(()=>(g.addEvent(e),d({request:p,responseHeaders:s,responseBody:l,runOnResponseCallbacks:m.call})))}}})({config:n,logger:l,lifecycle:I,consent:R,createEvent:Kt,createDataCollectionRequestPayload:mn,createDataCollectionRequest:un,sendEdgeNetworkRequest:P,applyResponse:D});return(({componentCreators:e,lifecycle:t,componentRegistry:n,getImmediatelyAvailableTools:r})=>(e.forEach(e=>{const{namespace:t}=e,o=r(t);let i;try{i=e(o)}catch(e){throw Pe({error:e,message:`[${t}] An error occurred during component creation.`})}n.register(t,i)}),t.onComponentsRegistered({lifecycle:t}).then(()=>n)))({componentCreators:b,lifecycle:I,componentRegistry:w,getImmediatelyAvailableTools(t){const r=u(t);return{loggingCookieJar:E,instanceName:e,config:n,componentRegistry:w,consent:R,identity:T,eventManager:O,fireReferrerHideableImage:h,logger:r,lifecycle:I,sendEdgeNetworkRequest:P,handleError:an({errorPrefix:`[${e}] [${t}]`,logger:r}),apexDomain:f,getBrowser:v,cookieTransfer:d,createResponse:C,platformServices:o}}})},setDebugCommand:e=>{s(e.enabled,{fromConfig:!1})},handleError:k,validateCommandOptions:nn});return l.logOnInstanceCreated({instance:C}),C},Qn=(e,t)=>`URL destination ${t?\"succeeded\":\"failed\"}: ${e.spec.url}`;var Wn=({fireReferrerHideableImage:e,logger:t,cookieJar:n,isPageSsl:r})=>{const o=r?{sameSite:\"none\",secure:!0}:{};return r=>((e=>{e.filter(e=>\"cookie\"===e.type).forEach(e=>{const{name:t,value:r,domain:i,ttlDays:a}=e.spec;n.set(t,r||\"\",{domain:i||\"\",expires:a||10,...o})})})(r),(async n=>{const r=n.filter(e=>\"url\"===e.type);await Promise.allSettled(r.map(async n=>{try{await e(n.spec),t.info(Qn(n,!0))}catch{t.warn(Qn(n,!1))}}))})(r))};const Kn=({logger:e,fireReferrerHideableImage:t,platformServices:n})=>{const r=n.cookie.withConverter({write:e=>encodeURIComponent(e)}),o=d({logger:e,cookieJar:r}),i=(({processDestinations:e})=>({response:t})=>{const n=t.getPayloadsByType(\"activation:push\");return e(n),{destinations:t.getPayloadsByType(\"activation:pull\")}})({processDestinations:Wn({fireReferrerHideableImage:t,logger:e,cookieJar:o,isPageSsl:n.globals.isPageSsl()})});return{lifecycle:{onResponse:i},commands:{}}};Kn.namespace=\"Audiences\";const Yn=({standard:e,version:t})=>`${e}.${t}`;var Zn=({storage:e})=>({clear(){e.clear()},lookup(t){const n={},r=e=>{const t=Yn(e),{standard:r,version:o,...i}=e;var a;return n[t]||(n[t]=(a=i,F(JSON.stringify(ke(a)))).toString()),n[t]};return{isNew:async()=>(await Promise.all(t.map(async t=>{const n=Yn(t),o=await e.getItem(n);return null===o||o!==r(t)}))).some(Boolean),async save(){await Promise.all(t.map(t=>{const n=Yn(t);return e.setItem(n,r(t))}))}}}}),er=()=>{const e={};return{...gn({content:e,addIdentity:(t,n)=>{e.identityMap=e.identityMap||{},e.identityMap[t]=e.identityMap[t]||[],e.identityMap[t].push(n)},hasIdentity:t=>void 0!==(e.identityMap&&e.identityMap[t])}),setConsent:t=>{e.consent=t}}},tr=({payload:e,datastreamIdOverride:t})=>ln({payload:e,datastreamIdOverride:t,getAction:()=>\"privacy/set-consent\",getUseSendBeacon:()=>!1}),nr=e=>e.split(\";\").reduce((e,t)=>{const[n,r]=t.split(\"=\");return e[n]=r,e},{}),rr=Ct({consent:vt(yt()).required().nonEmpty(),identityMap:Dt,edgeConfigOverrides:Rt}).noUnknownFields().required(),or=Ct({defaultConsent:Pt(Lt,_t,Ut).default(Lt)});const ir=({config:e,consent:n,sendEdgeNetworkRequest:r,platformServices:o})=>{const{orgId:i,defaultConsent:a}=e,s=(({parseConsentCookie:e,orgId:t,cookieJar:n})=>{const r=G(t,\"consent\");return{read(){const t=n.get(r);return t?e(t):{}},clear(){n.remove(r)}}})({parseConsentCookie:nr,orgId:i,cookieJar:o.cookie}),c=(()=>{let e=0,t=Promise.resolve();return{addTask(n){e+=1;const r=()=>n().finally(()=>{e-=1});return t=t.then(r,r),t},get length(){return e}}})(),d=(({createConsentRequestPayload:e,createConsentRequest:n,sendEdgeNetworkRequest:r,edgeConfigOverrides:o})=>({consentOptions:i,identityMap:a,edgeConfigOverrides:s})=>{const c=fn({payload:e(),globalConfigOverrides:o,localConfigOverrides:s});c.payload.setConsent(i),t(a)&&Object.keys(a).forEach(e=>{a[e].forEach(t=>{c.payload.addIdentity(e,t)})});const d=n(c);return r({request:d}).then(()=>{})})({createConsentRequestPayload:er,createConsentRequest:tr,sendEdgeNetworkRequest:r,edgeConfigOverrides:e.edgeConfigOverrides}),l=o.storage.createNamespacedStorage(`${X(i)}.consentHashes.`),u=Zn({storage:l.persistent}),g=ae({orgId:i,cookieJar:o.cookie});return(({storedConsent:e,taskQueue:t,defaultConsent:n,consent:r,sendSetConsentRequest:o,validateSetConsentOptions:i,consentHashStore:a,doesIdentityCookieExist:s})=>{const c={[Vt]:n};let d=e.read();const l=s(),u=void 0!==d[Vt];l&&u||a.clear(),l||(e.clear(),d={}),r.initializeConsent(c,d);const g=()=>{if(0===t.length){const t=e.read();void 0!==t[Vt]&&r.setConsent(t)}};return{commands:{setConsent:{optionsValidator:i,run:({consent:n,identityMap:i,edgeConfigOverrides:s})=>{r.suspend();const d=a.lookup(n);return t.addTask(async()=>{if(await d.isNew())return o({consentOptions:n,identityMap:i,edgeConfigOverrides:s})}).then(()=>d.save()).catch(n=>{throw 0===t.length&&void 0===e.read()[Vt]&&r.setConsent(c),n}).finally(g)}}},lifecycle:{onResponse:g,onRequestFailure:g}}})({storedConsent:s,taskQueue:c,defaultConsent:a,consent:n,sendSetConsentRequest:d,validateSetConsentOptions:rr,consentHashStore:u,doesIdentityCookieExist:g})};ir.namespace=\"Consent\",ir.configValidators=or;var ar=()=>({eventMergeId:Me()});const sr=()=>(({createEventMergeId:e})=>({commands:{createEventMergeId:{run:e}}}))({createEventMergeId:ar});sr.namespace=\"EventMerge\";var cr={PAUSE:\"media.pauseStart\",PLAY:\"media.play\",BUFFER_START:\"media.bufferStart\",AD_START:\"media.adStart\",Ad_BREAK_START:\"media.adBreakStart\",SESSION_END:\"media.sessionEnd\",SESSION_START:\"media.sessionStart\",SESSION_COMPLETE:\"media.sessionComplete\",PING:\"media.ping\",AD_BREAK_COMPLETE:\"media.adBreakComplete\",AD_COMPLETE:\"media.adComplete\",AD_SKIP:\"media.adSkip\",BITRATE_CHANGE:\"media.bitrateChange\",CHAPTER_COMPLETE:\"media.chapterComplete\",CHAPTER_SKIP:\"media.chapterSkip\",CHAPTER_START:\"media.chapterStart\",ERROR:\"media.error\",STATES_UPDATE:\"media.statesUpdate\"},dr=({config:e,eventManager:t,consent:n,sendEdgeNetworkRequest:r,setTimestamp:o})=>({createMediaEvent({options:n}){const r=t.createEvent(),{xdm:i}=n;if(o(r),r.setUserXdm(i),i.eventType===cr.AD_START){const{advertisingDetails:t}=n.xdm.mediaCollection;r.mergeXdm({mediaCollection:{advertisingDetails:{playerName:t.playerName||e.streamingMedia.playerName}}})}return r},createMediaSession(n){const{playerName:r,channel:i,appVersion:a}=e.streamingMedia,s=t.createEvent(),{sessionDetails:c}=n.xdm.mediaCollection;return o(s),s.setUserXdm(n.xdm),s.mergeXdm({eventType:cr.SESSION_START,mediaCollection:{sessionDetails:{playerName:c.playerName||r,channel:c.channel||i,appVersion:c.appVersion||a}}}),s},augmentMediaEvent({event:e,playerId:t,getPlayerDetails:n,sessionID:r}){if(!t||!n)return e;const{playhead:o,qoeDataDetails:i}=n({playerId:t});return e.mergeXdm({mediaCollection:{playhead:De(o),qoeDataDetails:i,sessionID:r}}),e},trackMediaSession({event:e,mediaOptions:n,edgeConfigOverrides:r}){const o={mediaOptions:n,edgeConfigOverrides:r};return t.sendEvent(e,o)},trackMediaEvent({event:e,action:t}){const o=mn(),i=(({mediaRequestPayload:e,action:t})=>ln({payload:e,edgeSubPath:\"/va\",getAction:()=>t,getUseSendBeacon:()=>!1}))({mediaRequestPayload:o,action:t});return o.addEvent(e),e.finalize(),n.awaitConsent().then(()=>r({request:i}).then(()=>({})))}}),lr=\"main\",ur=\"completed\",gr=()=>{let e;return{getSession:t=>e[t]||{},storeSession:({playerId:t,sessionDetails:n})=>{void 0===e&&(e={}),e[t]=n},stopPing:({playerId:t})=>{const n=e[t];n&&(clearTimeout(n.pingId),n.pingId=null,n.playbackState=ur)},savePing:({playerId:t,pingId:n,playbackState:r})=>{e[t]&&(e[t].pingId&&clearTimeout(e[t].pingId),e[t].pingId=n,e[t].playbackState=r)}}};var pr=({mediaEventManager:e,mediaSessionCacheManager:t,config:n})=>{const r=o=>{const i=e.createMediaEvent({options:o}),{playerId:a,xdm:s}=o,{eventType:c}=s,d=c.split(\".\")[1],{getPlayerDetails:l,sessionPromise:u,playbackState:g}=t.getSession(a);return u.then(o=>o.sessionId?(e.augmentMediaEvent({event:i,eventType:c,playerId:a,getPlayerDetails:l,sessionID:o.sessionId}),e.trackMediaEvent({event:i,action:d}).then(()=>{if(a)if(c===cr.SESSION_COMPLETE||c===cr.SESSION_END)t.stopPing({playerId:a});else{const e=((e,t)=>e===cr.AD_START||e===cr.Ad_BREAK_START||e===cr.AD_SKIP||e===cr.AD_COMPLETE?\"ad\":e===cr.AD_BREAK_COMPLETE||e===cr.CHAPTER_COMPLETE||e===cr.CHAPTER_START||e===cr.CHAPTER_SKIP||e===cr.SESSION_START?\"main\":e===cr.SESSION_END||e===cr.SESSION_COMPLETE?\"completed\":t)(c,g);if(\"completed\"===e)return;const o=\"ad\"===e?n.streamingMedia.adPingInterval:n.streamingMedia.mainPingInterval,i=setTimeout(()=>{r({playerId:a,xdm:{eventType:cr.PING}})},1e3*o);t.savePing({playerId:a,pingId:i,playbackState:e})}})):Promise.reject(new Error(`Failed to trigger media event: ${c}. Session ID is not available for playerId: ${a}.`)))};return e=>r(e)},mr=({config:e,mediaEventManager:t,mediaSessionCacheManager:n,legacy:r=!1})=>o=>{if(!e.streamingMedia)return Promise.reject(new Error(\"Streaming media is not configured.\"));const{playerId:i,getPlayerDetails:a,edgeConfigOverrides:s}=o,c=t.createMediaSession(o);t.augmentMediaEvent({event:c,playerId:i,getPlayerDetails:a});const d=t.trackMediaSession({event:c,mediaOptions:{playerId:i,getPlayerDetails:a,legacy:r},edgeConfigOverrides:s});return n.storeSession({playerId:i,sessionDetails:{sessionPromise:d,getPlayerDetails:a,playbackState:lr}}),d},fr=e=>!ge(e)||!e.trim(),hr=({mediaSessionCacheManager:e,config:t,trackMediaEvent:n})=>({response:r,playerId:o,getPlayerDetails:i})=>{const a=r.getPayloadsByType(\"media-analytics:new-session\");if(I(a)){const{sessionId:r}=a[0];if(fr(r))return{};if(!o||!i)return{sessionId:r};const s=setTimeout(()=>{n({playerId:o,xdm:{eventType:cr.PING}})},1e3*t.streamingMedia.mainPingInterval);return e.savePing({playerId:o,pingId:s,playbackState:lr}),{sessionId:r}}return{}};const yr={Video:\"video\",Audio:\"audio\"},vr={VOD:\"vod\",Live:\"live\",Linear:\"linear\",Podcast:\"podcast\",Audiobook:\"audiobook\",AOD:\"aod\"},wr={FullScreen:\"fullScreen\",ClosedCaption:\"closedCaptioning\",Mute:\"mute\",PictureInPicture:\"pictureInPicture\",InFocus:\"inFocus\"},Ir={AdBreakStart:\"adBreakStart\",AdBreakComplete:\"adBreakComplete\",AdStart:\"adStart\",AdComplete:\"adComplete\",AdSkip:\"adSkip\",ChapterStart:\"chapterStart\",ChapterComplete:\"chapterComplete\",ChapterSkip:\"chapterSkip\",SeekStart:\"seekStart\",SeekComplete:\"seekComplete\",BufferStart:\"bufferStart\",BufferComplete:\"bufferComplete\",BitrateChange:\"bitrateChange\",StateStart:\"stateStart\",StateEnd:\"stateEnd\"},br=\"sessionStart\",Er=\"sessionEnd\",kr=\"sessionComplete\",Cr=\"play\",Sr=\"pauseStart\",Pr=\"error\",Dr=\"statesUpdate\",Rr={MediaResumed:\"media.resumed\",GranularAdTracking:\"media.granularadtracking\"},Tr={Show:\"a.media.show\",Season:\"a.media.season\",Episode:\"a.media.episode\",AssetId:\"a.media.asset\",Genre:\"a.media.genre\",FirstAirDate:\"a.media.airDate\",FirstDigitalDate:\"a.media.digitalDate\",Rating:\"a.media.rating\",Originator:\"a.media.originator\",Network:\"a.media.network\",ShowType:\"a.media.type\",AdLoad:\"a.media.adLoad\",MVPD:\"a.media.pass.mvpd\",Authorized:\"a.media.pass.auth\",DayPart:\"a.media.dayPart\",Feed:\"a.media.feed\",StreamFormat:\"a.media.format\"},Or={Artist:\"a.media.artist\",Album:\"a.media.album\",Label:\"a.media.label\",Author:\"a.media.author\",Station:\"a.media.station\",Publisher:\"a.media.publisher\"},Mr={Advertiser:\"a.media.ad.advertiser\",CampaignId:\"a.media.ad.campaign\",CreativeId:\"a.media.ad.creative\",PlacementId:\"a.media.ad.placement\",SiteId:\"a.media.ad.site\",CreativeUrl:\"a.media.ad.creativeURL\"};var Nr=({logger:e})=>{const t=(t,n,r)=>{const o=Ct(n),i=Object.keys(n);return(...n)=>{const a=Object.fromEntries(i.map((e,t)=>[e,n[t]]));try{const e=o(a),t=i.map(t=>e[t]);return r(...t)}catch(n){return e.warn(`An error occurred while creating the ${t}.`,n),{}}}};return{createMediaObject:t(\"MediaObject\",{name:St().nonEmpty(),id:St().nonEmpty(),length:Et().required(),streamType:St().nonEmpty(),mediaType:St().nonEmpty()},(e,t,n,r,o)=>({sessionDetails:{friendlyName:e,name:t,length:Math.round(n),contentType:r,streamType:o}})),createAdBreakObject:t(\"AdBreakObject\",{name:St().nonEmpty(),position:Et(),startTime:Et()},(e,t,n)=>({advertisingPodDetails:{friendlyName:e,index:t,offset:n}})),createAdObject:t(\"AdObject\",{name:St().nonEmpty(),id:St().nonEmpty(),position:Et(),length:Et()},(e,t,n,r)=>({advertisingDetails:{friendlyName:e,name:t,podPosition:n,length:r}})),createChapterObject:t(\"ChapterObject\",{name:St().nonEmpty(),position:Et(),length:Et(),startTime:Et()},(e,t,n,r)=>({chapterDetails:{friendlyName:e,index:t,length:n,offset:r}})),createStateObject:t(\"StateObject\",{stateName:St().matches(/^[a-zA-Z0-9_]{1,64}$/,\"This is not a valid state name.\")},e=>({name:e})),createQoEObject:t(\"QoEObject\",{bitrate:Et(),startupTime:Et(),fps:Et(),droppedFrames:Et()},(e,t,n,r)=>({bitrate:e,timeToStart:t,framesPerSecond:n,droppedFrames:r})),version:`WEBSDK ${Vn}`}};const Ar={\"a.media.show\":\"show\",\"a.media.season\":\"season\",\"a.media.episode\":\"episode\",\"a.media.asset\":\"assetID\",\"a.media.genre\":\"genre\",\"a.media.airDate\":\"firstAirDate\",\"a.media.digitalDate\":\"firstDigitalDate\",\"a.media.rating\":\"rating\",\"a.media.originator\":\"originator\",\"a.media.network\":\"network\",\"a.media.type\":\"showType\",\"a.media.adLoad\":\"adLoad\",\"a.media.pass.mvpd\":\"mvpd\",\"a.media.pass.auth\":\"authorized\",\"a.media.dayPart\":\"dayPart\",\"a.media.feed\":\"feed\",\"a.media.format\":\"streamFormat\",\"a.media.artist\":\"artist\",\"a.media.album\":\"album\",\"a.media.label\":\"label\",\"a.media.author\":\"author\",\"a.media.station\":\"station\",\"a.media.publisher\":\"publisher\",\"media.resumed\":\"hasResume\"},xr={\"a.media.ad.advertiser\":\"advertiser\",\"a.media.ad.campaign\":\"campaignID\",\"a.media.ad.creative\":\"creativeID\",\"a.media.ad.placement\":\"placementID\",\"a.media.ad.site\":\"siteID\",\"a.media.ad.creativeURL\":\"creativeURL\"};var qr=({logger:t,trackMediaSession:n,trackMediaEvent:r,uuid:o})=>{let i=null;const a=({eventType:e,mediaDetails:t={},contextData:n=[]})=>{const r=(({eventType:e})=>e===Ir.BufferComplete||e===Ir.SeekComplete?Cr:e===Ir.StateStart||e===Ir.StateEnd?Dr:e===Ir.SeekStart?Sr:e)({eventType:e});if(e===Ir.StateStart){return{eventType:`media.${r}`,mediaCollection:{statesStart:[t]}}}if(e===Ir.StateEnd){return{eventType:`media.${r}`,mediaCollection:{statesEnd:[t]}}}const o={eventType:`media.${r}`,mediaCollection:{...t}},i=[];return Object.keys(n).forEach(e=>{Ar[e]?o.mediaCollection.sessionDetails[Ar[e]]=n[e]:xr[e]?o.mediaCollection.advertisingDetails[xr[e]]=n[e]:i.push({name:e,value:n[e]})}),I(i)&&(o.mediaCollection.customMetadata=i),o};return{trackSessionStart:(r,s={})=>{if(e(r)||j(r))return t.warn(\"Invalid media object\"),{};null===i&&(t.warn(\"The Media Session was completed. Restarting a new session.\"),i={qoe:null,lastPlayhead:0,playerId:o()});const c=a({eventType:br,mediaDetails:r,contextData:s});return n({playerId:i.playerId,getPlayerDetails:()=>({playhead:i.lastPlayhead,qoeDataDetails:i.qoe}),xdm:c})},trackPlay:()=>{if(null===i)return t.warn(\"The Media Session was completed.\"),{};const e=a({eventType:Cr});return r({playerId:i.playerId,xdm:e})},trackPause:()=>{if(null===i)return t.warn(\"The Media Session was completed.\"),{};const e=a({eventType:Sr});return r({playerId:i.playerId,xdm:e})},trackSessionEnd:()=>{if(null===i)return t.warn(\"The Media Session was completed.\"),{};const e=a({eventType:Er});return r({playerId:i.playerId,xdm:e})},trackComplete:()=>{if(null===i)return t.warn(\"The Media Session was completed.\"),{};const e=a({eventType:kr});return r({playerId:i.playerId,xdm:e})},trackError:e=>{if(t.warn(`trackError(${e})`),null===i)return t.warn(\"The Media Session was completed.\"),{};const n=a({eventType:Pr,mediaDetails:{errorDetails:{name:e,source:\"player\"}}});return r({playerId:i.playerId,xdm:n})},trackEvent:(e,n,o)=>{if(j(n))return t.warn(\"Invalid media object.\"),{};if(null===i)return t.warn(\"The Media Session was completed.\"),{};if(!Object.values(Ir).includes(e))return t.warn(\"Invalid event type\"),{};const s=a({eventType:e,mediaDetails:n,contextData:o});return r({playerId:i.playerId,xdm:s})},updatePlayhead:e=>{null!==i?le(e)&&(i.lastPlayhead=parseInt(e,10)):t.warn(\"The Media Session was completed.\")},updateQoEObject:e=>{null!==i?e&&(i.qoe=e):t.warn(\"The Media Session was completed.\")},destroy:()=>{t.warn(\"Destroy called, destroying the tracker.\"),i=null}}},$r=e=>t=>{const n=e().toISOString();t.mergeXdm({timestamp:n})};const Lr=({eventManager:e,sendEdgeNetworkRequest:t,config:n,logger:r,consent:o})=>{const i=gr(),a=dr({sendEdgeNetworkRequest:t,config:n,consent:o,eventManager:e,setTimestamp:$r(()=>new Date)}),s=pr({mediaSessionCacheManager:i,mediaEventManager:a,config:n}),c=mr({config:n,mediaEventManager:a,mediaSessionCacheManager:i,legacy:!0});return(({trackMediaEvent:e,trackMediaSession:t,mediaResponseHandler:n,logger:r,createMediaHelper:o,createGetInstance:i,config:a})=>({lifecycle:{onBeforeEvent({mediaOptions:e,onResponse:t=me}){if(!e)return;const{legacy:r,playerId:o,getPlayerDetails:i}=e;r&&t(({response:e})=>n({playerId:o,getPlayerDetails:i,response:e}))}},commands:{getMediaAnalyticsTracker:{run:()=>{if(!a.streamingMedia)return Promise.reject(new Error(\"Streaming media is not configured.\"));r.info(\"Streaming media is configured in legacy mode.\");const n=o({logger:r});return Promise.resolve({getInstance:()=>i({logger:r,trackMediaEvent:e,trackMediaSession:t,uuid:Me}),Event:Ir,MediaType:yr,PlayerState:wr,StreamType:vr,MediaObjectKey:Rr,VideoMetadataKeys:Tr,AudioMetadataKeys:Or,AdMetadataKeys:Mr,...n})}}}}))({mediaResponseHandler:hr({mediaSessionCacheManager:i,config:n,trackMediaEvent:s}),trackMediaSession:c,trackMediaEvent:s,createMediaHelper:Nr,createGetInstance:qr,logger:r,config:n})};Lr.namespace=\"Legacy Media Analytics\";const _r=\"AJO\",Ur=\"TGT\",jr=e=>null!==e&&\"object\"==typeof e&&Object.getPrototypeOf(e)===Object.prototype,Br=(e,t={},n=[])=>(Object.keys(e).forEach(r=>{jr(e[r])||Array.isArray(e[r])?Br(e[r],t,[...n,r]):t[[...n,r].join(\".\")]=e[r]}),t);var Fr=e=>jr(e)?Br(e):e;const Vr=\"matcher\",Hr=\"group\",zr=\"historical\",Jr=\"eq\",Xr=\"ne\",Gr=\"ex\",Qr=\"nx\",Wr=\"gt\",Kr=\"ge\",Yr=\"lt\",Zr=\"le\",eo=\"co\",to=\"nc\",no=\"sw\",ro=\"ew\",oo=\"and\",io=\"or\",ao=\"ordered\",so=\"mostRecent\";function co(e){return\"object\"==typeof e||void 0===e}function lo(e){return\"number\"==typeof e}const uo={[Jr]:{matches:(e,t,n=[])=>{if(co(e[t]))return!1;const r=String(e[t]).toLowerCase();for(let e=0;e<n.length;e+=1)if(!co(n[e])&&r===String(n[e]).toLowerCase())return!0;return!1}},[Xr]:{matches:(e,t,n=[])=>{if(co(e[t]))return!1;const r=String(e[t]).toLowerCase();for(let e=0;e<n.length;e+=1)if(!co(n[e])&&r===String(n[e]).toLowerCase())return!1;return!0}},[Gr]:{matches:(e,t)=>void 0!==e[t]&&null!==e[t]},[Qr]:{matches:(e,t)=>void 0===e[t]||null===e[t]},[Wr]:{matches:(e,t,n=[])=>{const r=e[t];if(!lo(r))return!1;for(let e=0;e<n.length;e+=1)if(lo(n[e])&&r>n[e])return!0;return!1}},[Kr]:{matches:(e,t,n=[])=>{const r=e[t];if(!lo(r))return!1;for(let e=0;e<n.length;e+=1)if(lo(n[e])&&r>=n[e])return!0;return!1}},[Yr]:{matches:(e,t,n=[])=>{const r=e[t];if(!lo(r))return!1;for(let e=0;e<n.length;e+=1)if(lo(n[e])&&r<n[e])return!0;return!1}},[Zr]:{matches:(e,t,n=[])=>{const r=e[t];if(!lo(r))return!1;for(let e=0;e<n.length;e+=1)if(lo(n[e])&&r<=n[e])return!0;return!1}},[eo]:{matches:(e,t,n=[])=>{if(co(e[t]))return!1;const r=String(e[t]).toLowerCase();for(let e=0;e<n.length;e+=1)if(!co(n[e])&&-1!==r.indexOf(String(n[e]).toLowerCase()))return!0;return!1}},[to]:{matches:(e,t,n=[])=>{if(co(e[t]))return!1;const r=String(e[t]).toLowerCase();for(let e=0;e<n.length;e+=1)if(!co(n[e])&&-1!==r.indexOf(String(n[e]).toLowerCase()))return!1;return!0}},[no]:{matches:(e,t,n=[])=>{if(co(e[t]))return!1;const r=String(e[t]).toLowerCase();for(let e=0;e<n.length;e+=1)if(!co(n[e])&&r.startsWith(String(n[e]).toLowerCase()))return!0;return!1}},[ro]:{matches:(e,t,n=[])=>{if(co(e[t]))return!1;const r=String(e[t]).toLowerCase();for(let e=0;e<n.length;e+=1)if(!co(n[e])&&r.endsWith(n[e].toLowerCase()))return!0;return!1}}};function go(e){return void 0===e}const po=\"eventId\",mo=\"eventType\",fo=[\"iam.eventType\",mo,\"type\"],ho=[\"iam.id\",\"id\"],yo=(e,t)=>{for(let n=0;n<t.length;n+=1)if(!go(e[t[n]]))return t[n];throw new Error(\"The event does not match the expected schema.\")},vo=e=>{const t=structuredClone(e);return[[yo(t,fo),mo],[yo(t,ho),po]].forEach(([e,n])=>{e!==n&&(t[n]=t[e],delete t[e])}),t};function wo(e,t){return{evaluate:(e,n)=>t.evaluate(e,n),toString:()=>`Condition{type=${e}, definition=${t}}`}}function Io(e,t,n){return{evaluate:r=>{const o=function(e){return uo[e]}(t);return!!o&&o.matches(r,e,n)}}}function bo(e,t,n,r,o,i){return{evaluate:(a,s)=>{let c;return c=so===i?function(e,t,n,r=0,o=1/0){try{return e.reduce((e,i,a)=>{const s=n.generateEventHash(vo(i)),c=t.events[s];if(!c)return e;const d=c.timestamps.filter(e=>e>=r&&e<=o).pop();return d&&d>e.timestamp?{index:a,timestamp:d}:e},{index:-1,timestamp:0}).index}catch{return-1}}(e,a,s,r,o):ao===i?function(e,t,n,r=0,o=1/0){try{let i=r;const a=e.every(e=>{const r=n.generateEventHash(vo(e)),a=t.events[r];if(!a)return!1;const s=a.timestamps[0],c=s>=i&&s<=o;return i=s,c});return Number(a)}catch{return 0}}(e,a,s,r,o):function(e,t,n,r=0,o=1/0){return e.reduce((e,i)=>{try{const a=n.generateEventHash(vo(i)),s=t.events[a];if(!s)return e;const{timestamps:c=[]}=s;return e+c.filter(e=>e>=r&&e<=o).length}catch{return e}},0)}(e,a,s,r,o),((e,t,n)=>{switch(t){case Wr:return e>n;case Kr:return e>=n;case Yr:return e<n;case Zr:return e<=n;case Jr:return e===n;case Xr:return e!==n;default:return!1}})(c,t,n)}}}function Eo(e){const{logic:t,conditions:n}=e;return function(e,t){return{evaluate:(n,r)=>oo===e?function(e,t,n){let r=!0;for(let o=0;o<t.length;o+=1)r=r&&t[o].evaluate(e,n);return r}(n,t,r):io===e&&function(e,t,n){let r=!1;for(let o=0;o<t.length;o+=1)if(r=r||t[o].evaluate(e,n),r)return!0;return!1}(n,t,r)}}(t,n.map(ko))}function ko(e){const{type:t,definition:n}=e;if(Vr===t){const e=function(e){const{key:t,matcher:n,values:r}=e;return Io(t,n,r)}(n);return wo(t,e)}if(Hr===t){return wo(t,Eo(n))}if(zr===t){const e=function(e){const{events:t,from:n,to:r,matcher:o,value:i,searchType:a}=e;return bo(t,o,i,n,r,a)}(n);return wo(t,e)}throw new Error(\"Can not parse condition\")}function Co(e){const{id:t,type:n,detail:r}=e;return function(e,t,n){return{id:e,type:t,detail:n}}(t,n,r)}function So(e){const{condition:t,consequences:n,key:r}=e;return function(e,t,n){return{key:n,execute:(n,r)=>e.evaluate(n,r)?t:[],toString:()=>`Rule{condition=${e}, consequences=${t}}`}}(ko(t),n.map(Co),r)}function Po(e){const{version:t,rules:n,metadata:r}=e,o=n.map(So),i=function(e){if(!e)return;return{provider:e.provider,providerData:Object.assign({},e.providerData)}}(r);return function(e,t,n){return{version:e,rules:t,metadata:n}}(t,o,i)}function Do(e,t,n){const{providerData:r}=n,{identityTemplate:o}=r;return o.replace(\"<key>\",t).replace(\"<identity>\",e)}function Ro(e,t=e=>e[0]){const n={};return function(...r){const o=t(r);return go(n[o])&&(n[o]=e(...r)),n[o]}}function To(e,t){const n=65535&t;return((t-n)*e|0)+(n*e|0)|0}const Oo=Ro(function(e,t=0){let n;const r=e.length,o=3432918353,i=461845907;let a=t;const s=-2&r;for(let t=0;t<s;t+=2)n=e.charCodeAt(t)|e.charCodeAt(t+1)<<16,n=To(n,o),n=(131071&n)<<15|n>>>17,n=To(n,i),a^=n,a=(524287&a)<<13|a>>>19,a=5*a+3864292196|0;return r%2==1&&(n=e.charCodeAt(s),n=To(n,o),n=(131071&n)<<15|n>>>17,n=To(n,i),a^=n),a^=r<<1,a^=a>>>16,a=To(a,2246822507),a^=a>>>13,a=To(a,3266489909),a^=a>>>16,a},e=>e.join(\"-\"));const Mo=Ro(function(e,t){const n=Oo(e),r=Math.abs(n)%t/t*100;return Math.round(100*r)/100});function No(e,t,n){return{allocation:Mo(e,t),...n}}function Ao(e,t){return t.map(t=>t.execute(e)).filter(e=>e.length>0)}function xo(e,t){!function(e){const{providerData:t}=e;if(!t)throw new Error(\"Provider data is missing in metadata\");const{identityTemplate:n,buckets:r}=t;if(!n)throw new Error(\"Identity template is missing in provider data\");if(!r)throw new Error(\"Buckets is missing in provider data\")}(t);const n=e.filter(e=>!e.key),r=function(e){const t={};for(let n=0;n<e.length;n+=1){const r=e[n];r.key&&(t[r.key]||(t[r.key]=[]),t[r.key].push(r))}return t}(e),{buckets:o}=t.providerData;return{provider:\"TGT\",execute:e=>{const i=function(e){const{xdm:t}=e;if(!t)throw new Error(\"XDM object is missing in the context\");const{identityMap:n}=t;if(!n)throw new Error(\"Identity map is missing in the XDM object\");const r=n.ECID;if(!r)throw new Error(\"ECID identity namespace is missing in the identity map\");if(!Array.isArray(r)||0===r.length)throw new Error(\"ECID identities array is empty or not an array\");const o=r[0].id;if(!o)throw new Error(\"ECID identity is missing in the identities array\");return o}(e),a=Ao(e,n),s=Object.keys(r),c=[];for(let n=0;n<s.length;n+=1){const a=s[n],d=r[a],l=Ao(No(Do(i,a,t),o,e),d);c.push(...l)}return[...a,...c]}}}function qo(e,t={generateEventHash:()=>{throw new Error(\"No hash function provided\")}}){const{rules:n,metadata:r={}}=Po(e);return function(e,t,n){const{provider:r}=t;return\"TGT\"===r?xo(e,t):function(e,t){return{provider:\"DEFAULT\",execute:n=>e.map(e=>e.execute(n,t)).filter(e=>e.length>0)}}(e,n)}(n,r,t)}const $o=\"https://ns.adobe.com/personalization/default-content-item\",Lo=\"https://ns.adobe.com/personalization/dom-action\",_o=\"https://ns.adobe.com/personalization/html-content-item\",Uo=\"https://ns.adobe.com/personalization/json-content-item\",jo=\"https://ns.adobe.com/personalization/ruleset-item\",Bo=\"https://ns.adobe.com/personalization/redirect-item\",Fo=\"https://ns.adobe.com/personalization/message/in-app\",Vo=\"decisioning.propositionDisplay\",Ho=\"decisioning.propositionInteract\",zo=\"decisioning.propositionTrigger\",Jo=\"decisioning.propositionDismiss\",Xo=\"decisioning.propositionSuppressDisplay\",Go={DISPLAY:\"display\",INTERACT:\"interact\",TRIGGER:\"trigger\",DISMISS:\"dismiss\",SUPPRESS:\"suppressDisplay\"},Qo={[Vo]:Go.DISPLAY,[Ho]:Go.INTERACT,[zo]:Go.TRIGGER,[Jo]:Go.DISMISS,[Xo]:Go.SUPPRESS},Wo={[Go.DISPLAY]:Vo,[Go.INTERACT]:Ho,[Go.TRIGGER]:zo,[Go.DISMISS]:Jo,[Go.SUPPRESS]:Xo},Ko=e=>Qo[e],Yo=e=>Wo[e];var Zo=e=>{const t=structuredClone(e),n=Object.keys(t).sort().reduce((e,n)=>{const r=t[n];return null==r||\"\"===r?e:e+=`${n}:${r}`},\"\");return F(n)};const ei=\"events\",ti=\"~type\",ni=\"~source\",ri=\"com.adobe.eventType.edge\",oi=\"com.adobe.eventType.rulesEngine\",ii=\"com.adobe.eventSource.requestContent\",ai=\"cjmiam\",si=\"schema\";var ci=(e=30,t=1e3)=>n=>{let r=Object.entries(n).reduce((e,[t,{timestamps:n=[]}])=>(n.forEach(n=>{e.push({key:t,timestamp:n})}),e),[]);const o=(e=>{const t=new Date;return t.setDate(t.getDate()-e),t})(e);return r=r.filter(({timestamp:e})=>e>=o),r.sort((e,t)=>e.timestamp-t.timestamp),r=r.slice(-t),r.reduce((e,{key:t,timestamp:n})=>(e[t]||(e[t]={timestamps:[]}),e[t].timestamps.push(n),e),{})};const di=e=>e?.scopeDetails?.activity?.id,li=(e,t)=>n=>{const r=e.setItem(t,JSON.stringify(n));r&&\"function\"==typeof r.then&&r.catch(()=>{})},ui=()=>{const e={};return{getItem:t=>t in e?e[t]:null,setItem:(t,n)=>{e[t]=n}}},gi=e=>{e.clear()};const pi=\"text/html\";const mi={[ai]:(e,t,n)=>{const{html:r,mobileParameters:o}=n;return{schema:Fo,data:{mobileParameters:o,webParameters:{},content:r,contentType:pi},id:e}},[si]:(e,t,n)=>{const{schema:r,data:o,id:i}=n;return{schema:r,data:o,id:i||e}}};const fi=e=>{const{schema:t,data:n}=e;if(t===jo)return!0;if(t!==Uo)return!1;try{const e=\"string\"==typeof n.content?JSON.parse(n.content):n.content;return e&&Object.prototype.hasOwnProperty.call(e,\"version\")&&Object.prototype.hasOwnProperty.call(e,\"rules\")}catch{return!1}};var hi=(e,t)=>{const n=e=>{const{id:t,type:n,detail:r}=e;return\"function\"==typeof mi[n]?mi[n](t,n,r):r},r=di(e),o=[],i=e=>{const{data:t={},schema:n}=e,r=n===jo?t:t.content;r&&o.push(qo(\"string\"==typeof r?JSON.parse(r):r,{generateEventHash:Zo}))};return Array.isArray(e.items)&&e.items.filter(fi).forEach(i),{rank:e?.scopeDetails?.rank||1/0,evaluate:i=>{const a=t.getEvent(Vo,r),s=a?.timestamps[0],c=((e=[])=>Array.isArray(e)?e.flat(1/0):e)(o.map(e=>e.execute(i))).map(n).map(e=>{const n=t.addEvent({eventType:Go.TRIGGER,eventId:r}).timestamps[0];return{...e,data:{...e.data,qualifiedDate:n,displayedDate:s}}});return{...e,items:c}},isEvaluable:o.length>0}},yi=({storage:e,logger:t})=>{let n=e,r={},o=0,i=li(e,ei);const a=async e=>{n=e;const t=((e,t)=>async n=>{try{const r=await e.getItem(t);return null==r?[n,0]:[JSON.parse(r),r.length]}catch{}return[n,0]})(n,ei);if([r,o]=await t({}),i=li(n,ei),o>2097152){const e=ci();r=e(r),i(r)}};a(e);const s=(e={eventType:null,eventId:null},n=\"insert\")=>{const{eventType:o,eventId:a}=e;if(!o||!a)return;const s=Zo(e);if(\"insertIfNotExists\"===n&&r[s])return;r[s]&&Array.isArray(r[s].timestamps)||(r[s]={timestamps:[]});const c=(new Date).getTime();return r[s].timestamps.push(c),r[s].timestamps.sort(),t.info(\"[Event History] Added event for\",e,\"with hash\",s,\"and timestamp\",c),i(r),r[s]};return{addExperienceEdgeEvent:e=>{const{xdm:t}=e.getContent();if(!(e=>{const{_experience:t}=e||{};return!!t&&\"object\"==typeof t})(t))return;const{_experience:{decisioning:{propositionEventType:n={},propositionAction:{id:r}={},propositions:o=[]}={}}}=t;Object.keys(n).filter(e=>1===n[e]).forEach(e=>{o.forEach(t=>{(e=>e?.scopeDetails?.decisionProvider)(t)===_r&&s({eventId:di(t),eventType:e,action:r})})})},addEvent:s,addEventPayloads:(e=[])=>e.map(({operation:e,event:t})=>s(t,e)),getEvent:(e,t)=>{const n=Zo({eventType:e,eventId:t});if(r[n])return r[n]},toJSON:()=>r,setStorage:a}};const vi=(e,...t)=>t,wi=(e,...t)=>!0;var Ii=({collect:e})=>{let t=()=>{};const n=new Set,r=(e,t,r)=>{const o=[e,t].join(\"-\"),i=!r.has(o)&&((e=>[Go.INTERACT,Go.DISMISS].includes(e))(e)||!n.has(o));return r.add(o),n.add(o),i},o=(t,n=[])=>{if(!(n instanceof Array))return Promise.resolve();if(!Object.values(Go).includes(t))return Promise.resolve();const o=[],i=new Set;return n.forEach(e=>{const n=(e=>{const{id:t,scope:n,scopeDetails:r}=e;return{id:t,scope:n,scopeDetails:r}})(e);r(t,n.id,i)&&o.push(n)}),o.length>0?e({decisionsMeta:o,eventType:Yo(t),documentMayUnload:!0}):Promise.resolve()},i=(()=>{let e=vi,t=wi,n=0;const r={};return{add:(e,t=void 0)=>{return\"function\"!=typeof e?()=>{}:(n+=1,r[n]={callback:e,params:t},{id:n,unsubscribe:(o=n,()=>{delete r[o]})});var o},emit:(...n)=>{Object.values(r).forEach(({callback:r,params:o})=>{const i=e(o,...n);t(o,...i)&&r(...i)})},emitOne:(n,...o)=>{if(!n||!r[n])return;const{callback:i,params:a}=r[n],s=e(a,...o);t(a,...s)&&i(...s)},hasSubscriptions:()=>Object.keys(r).length>0,setEmissionPreprocessor:t=>{\"function\"==typeof t&&(e=t)},setEmissionCondition:e=>{\"function\"==typeof e&&(t=e)}}})();i.setEmissionPreprocessor((e,t)=>{const{surfacesFilter:n,schemasFilter:r}=e;return[{propositions:t.filter(e=>!n||n.includes(e.scope)).map(e=>{const{items:t=[]}=e;return{...e,items:t.filter(e=>!r||r.includes(e.schema))}}).filter(e=>e.items.length>0)},o]});return{refresh:e=>{t=t=>{t?i.emitOne(t,e):i.emit(e)},t()},command:{optionsValidator:e=>(({options:e})=>Ct({surfaces:vt(St()).uniqueItems(),schemas:vt(St()).uniqueItems(),callback:It().required()}).noUnknownFields()(e))({options:e}),run:({surfaces:e,schemas:n,callback:r})=>{const{id:o,unsubscribe:a}=i.add(r,{surfacesFilter:e instanceof Array?e:void 0,schemasFilter:n instanceof Array?n:void 0});return t(o),Promise.resolve({unsubscribe:a})}}}};var bi=({contextProvider:e,decisionProvider:t})=>({optionsValidator:e=>(({options:e})=>Ct({renderDecisions:wt(),personalization:Ct({decisionContext:Ct({})})}).noUnknownFields()(e))({options:e}),run:({renderDecisions:n,decisionContext:r,applyResponse:o})=>o({renderDecisions:n,propositions:t.evaluate(e.getContext(r))})}),Ei=({eventManager:e,mergeDecisionsMeta:t})=>({decisionsMeta:n=[],propositionAction:r,documentMayUnload:o=!1,eventType:i=Vo,propositionEventTypes:a=[Ko(i)],viewName:s,identityMap:c})=>{const d=e.createEvent(),l={eventType:i,identityMap:c};return s&&(l.web={webPageDetails:{viewName:s}}),I(n)&&t(d,n,a,r),d.mergeXdm(l),o&&d.documentMayUnload(),e.sendEvent(d)};const ki=(e,t,n,r)=>{if(0===t.length)return;const o={};n.forEach(e=>{o[e]=1});const i={_experience:{decisioning:{propositions:t,propositionEventType:o}}};r&&(i._experience.decisioning.propositionAction=r),e.mergeXdm(i)},Ci=(e,t)=>{e.mergeQuery({personalization:{...t}})},Si=({config:e,eventManager:t,consent:n,getBrowser:r,logger:o,platformServices:i})=>{const{orgId:a,personalizationStorageEnabled:s}=e,c=Ei({eventManager:t,mergeDecisionsMeta:ki}),d=i.storage.createNamespacedStorage(`${X(a)}.decisioning.`);s||gi(d.persistent);const l=yi({storage:ui(),logger:o}),u=(({eventRegistry:e})=>{const t={},n=n=>{const r=di(n);if(!r)return;const o=hi(n,e);o.isEvaluable&&(t[r]=o)};return{addPayload:n,addPayloads:e=>{e.forEach(n)},evaluate:(e={})=>Object.values(t).sort(({rank:e},{rank:t})=>e-t).map(t=>t.evaluate(e)).filter(e=>e.items.length>0)}})({eventRegistry:l}),g=(({eventRegistry:e,getWindowContext:t,getBrowser:n})=>{const r=(new Date).getTime(),o=()=>{const e=new Date,t=e.getTime();return{pageLoadTimestamp:r,currentTimestamp:t,currentDate:e.getDate(),\"~state.com.adobe.module.lifecycle/lifecyclecontextdata.dayofweek\":e.getDay()+1,\"~state.com.adobe.module.lifecycle/lifecyclecontextdata.hourofday\":e.getHours(),currentMinute:e.getMinutes(),currentMonth:e.getMonth(),currentYear:e.getFullYear(),pageVisitDuration:t-r,\"~timestampu\":t/1e3,\"~timestampz\":e.toISOString()}},i=()=>{const{height:e,width:n,scrollY:r,scrollX:o}=t();return{height:e,width:n,scrollY:r,scrollX:o}},a={browser:{name:n()},page:(()=>{const{title:e,url:n}=t();return{title:e,url:n,...he(n)}})(),referringPage:(()=>{const{referrer:e}=t();return{url:e,...he(e)}})()};return{getContext:(t={})=>{const n={...{...a,...o(),window:i(),\"~sdkver\":Vn},...t};return{...Fr(n),events:e.toJSON()}}}})({eventRegistry:l,getWindowContext:i.globals.getWindowContext,getBrowser:r}),p=bi({contextProvider:g,decisionProvider:u}),m=Ii({collect:c});let f;return{lifecycle:{onDecision({propositions:e}){m.refresh(e)},onComponentsRegistered(e){f=(({lifecycle:e,eventRegistry:t})=>({renderDecisions:n=!1,propositions:r=[],event:o,personalization:i})=>{if(e){const a=(e=>{const t=[];return e.forEach(e=>{const n=[];e.items.forEach(e=>{\"https://ns.adobe.com/personalization/eventHistoryOperation\"===e.schema?t.push({operation:e.data.operation,event:{eventId:e.data.content[\"iam.id\"],eventType:e.data.content[\"iam.eventType\"]}}):n.push(e)}),e.items=n}),t})(r);t.addEventPayloads(a);const s=o?.getUserIdentityMap();e.onDecision({renderDecisions:n,propositions:r,event:o,personalization:i,identityMap:s})}return{propositions:r}})({lifecycle:e.lifecycle,eventRegistry:l}),s&&n.awaitConsent().then(()=>l.setStorage(d.persistent)).catch(()=>{d&&gi(d.persistent)})},onBeforeEvent({event:e,renderDecisions:t,personalization:n={},onResponse:r=me}){const{decisionContext:o={}}=n;r((({renderDecisions:e,decisionProvider:t,applyResponse:n,event:r,personalization:o,decisionContext:i})=>{const a={...Fr(r.getContent()),...i};return({response:i})=>{if(t.addPayloads(i.getPayloadsByType(\"personalization:decisions\")),!r.hasQuery())return{propositions:[]};const s=t.evaluate(a);return n({renderDecisions:e,propositions:s,event:r,personalization:o})}})({renderDecisions:t,decisionProvider:u,applyResponse:f,event:e,personalization:n,decisionContext:g.getContext({[ti]:ri,[ni]:ii,...o})}))},onBeforeRequest({request:e}){const t=e.getPayload().toJSON(),{events:n=[]}=t;0!==n.length&&n.forEach(e=>l.addExperienceEdgeEvent(e))}},commands:{evaluateRulesets:{run:({renderDecisions:e,personalization:t={}})=>{const{decisionContext:n={}}=t;return p.run({renderDecisions:e,decisionContext:{[ti]:oi,[ni]:ii,...n},applyResponse:f})},optionsValidator:p.optionsValidator},subscribeRulesetItems:m.command}}};Si.namespace=\"RulesEngine\",Si.configValidators=Ct({personalizationStorageEnabled:wt().default(!1)});var Pi=Ct({streamingMedia:Ct({channel:St().nonEmpty().required(),playerName:St().nonEmpty().required(),appVersion:St(),mainPingInterval:Et().minimum(10).maximum(50).default(10),adPingInterval:Et().minimum(1).maximum(10).default(10)}).noUnknownFields()}),Di=({config:e,trackMediaEvent:t,trackMediaSession:n,mediaResponseHandler:r})=>({lifecycle:{onBeforeEvent({mediaOptions:e,onResponse:t=me}){if(!e)return;const{legacy:n,playerId:o,getPlayerDetails:i}=e;n||t(({response:e})=>r({playerId:o,getPlayerDetails:i,response:e}))}},commands:{createMediaSession:{optionsValidator:e=>(({options:e})=>ht([Ct({playerId:St().required(),getPlayerDetails:It().required(),xdm:Ct({mediaCollection:Ct({sessionDetails:Ct(yt()).required()})}),edgeConfigOverrides:Rt}).required(),Ct({xdm:Ct({mediaCollection:Ct({playhead:Et().required(),sessionDetails:Ct(yt()).required()})}),edgeConfigOverrides:Rt}).required()],\"an object with playerId, getPlayerDetails and xdm.mediaCollection.sessionDetails, or an object with xdm.mediaCollection.playhead and xdm.mediaCollection.sessionDetails\")(e))({options:e}),run:n},sendMediaEvent:{optionsValidator:e=>(({options:e})=>ht([Ct({playerId:St().required(),xdm:Ct({eventType:Pt(...Object.values(cr)).required(),mediaCollection:Ct(yt())}).required()}).required(),Ct({xdm:Ct({eventType:Pt(...Object.values(cr)).required(),mediaCollection:Ct({playhead:Et().integer().required(),sessionID:St().required()}).required()}).required()}).required()],\"Error validating the sendMediaEvent command options.\")(e))({options:e}),run:n=>e.streamingMedia?t(n):Promise.reject(new Error(\"Streaming media is not configured.\"))}}});const Ri=({config:e,logger:t,eventManager:n,sendEdgeNetworkRequest:r,consent:o})=>{const i=gr(),a=dr({config:e,eventManager:n,consent:o,sendEdgeNetworkRequest:r,setTimestamp:$r(()=>new Date)}),s=pr({mediaSessionCacheManager:i,mediaEventManager:a,config:e}),c=mr({config:e,mediaEventManager:a,mediaSessionCacheManager:i}),d=hr({mediaSessionCacheManager:i,config:e,trackMediaEvent:s});return Di({config:e,trackMediaEvent:s,mediaResponseHandler:d,trackMediaSession:c})};Ri.namespace=\"Streaming media\",Ri.configValidators=Pi;const Ti=Ct({interactionId:St(),conversationId:St(),conversation:Ct({feedback:Ct({classification:St(),comment:St(),reasons:vt(St())})})});const Oi=\"web\",Mi=\"webapp\",Ni=\"://\",Ai=/^(\\w+):\\/\\/([^/#]+)(\\/[^#]*)?(#.*)?$/,xi=/^(?:.*@)?(?:[a-z\\d\\u00a1-\\uffff.-]+|\\[[a-f\\d:]+])(?::\\d+)?$/,qi=/^\\/(?:[/\\w\\u00a1-\\uffff-.~]|%[a-fA-F\\d]{2})*$/,$i=/^#(?:[/\\w\\u00a1-\\uffff-.~]|%[a-fA-F\\d]{2})+$/,Li=(e=\"/\")=>{let t=e.length;for(;t>0&&-1!==\"/\".indexOf(e.charAt(t-1));)t-=1;return e.substring(0,t)||\"/\"},_i=e=>`${e.surfaceType}${Ni}${e.authority}${e.path||\"\"}${e.fragment||\"\"}`,Ui=e=>{const t=e(),n=t.host.toLowerCase(),r=t.pathname;return Oi+Ni+n+Li(r)},ji=(e,t,n)=>{const r=e=>(n.warn(e),null);if(!pe(e))return r(`Invalid surface: ${e}`);const o=((e,t)=>e.startsWith(\"#\")?Ui(t)+e:e)(e,t),i=(e=>{const t=e.match(Ai);return t?{surfaceType:(o=t[1],pe(o)?o.toLowerCase():\"\"),authority:(r=t[2],pe(r)?r.toLowerCase():\"\"),path:(n=t[3],pe(n)?Li(n):\"/\"),fragment:t[4]}:null;var n,r,o})(o);return null===i?r(`Invalid surface: ${e}`):[Oi,Mi].includes(i.surfaceType)?i.authority&&xi.test(i.authority)?i.path&&!qi.test(i.path)?r(`Invalid path ${i.path} in surface: ${e}`):i.fragment&&!$i.test(i.fragment)?r(`Invalid fragment ${i.fragment} in surface: ${e}`):i:r(`Invalid authority ${i.authority} in surface: ${e}`):r(`Unsupported surface type ${i.surfaceType} in surface: ${e}`)},Bi=e=>!!e&&0===e.indexOf(Oi+Ni)&&-1===e.indexOf(\"#\"),Fi=1e4,Vi=({loggingCookieJar:e,config:t})=>{if(!1===t.conversation.stickyConversationSession)return Me();const n=G(t.orgId,\"bc_session_id\"),r=e.get(n);return r||Me()};var Hi=({eventManager:e,config:t,logger:n,sendConversationServiceRequest:r,buildEndpointUrl:o,cookieTransfer:i,createResponse:a,decodeKndctrCookie:s,lifecycle:c,consent:d,session:l,getPageLocation:u})=>{const{edgeDomain:g,datastreamId:p,onBeforeEventSend:m,conversation:f}=t;return h=>{let y=!1;const{message:v,onStreamResponse:w,xdm:I,data:b,voiceEnabled:E=!1}=h,k=mn(),C=(({payload:e,action:t=\"conversations\",sessionId:n,voiceEnabled:r=!1,region:o})=>ln({payload:e,edgeSubPath:r?\"/brand-concierge-voice\":\"/brand-concierge\"+(o?`/${o}`:\"\"),requestParams:{sessionId:n},getAction:()=>t,getUseSendBeacon:()=>!1}))({payload:k,sessionId:l.id,voiceEnabled:E,region:f.region}),S=e.createEvent();if(v||b){const e=Ui(u);S.mergeQuery({conversation:{surfaces:[e],message:v,data:b}})}const{state:P}=d.current();S.mergeMeta({consent:{state:P}});const D=s();S.mergeXdm({identityMap:{ECID:[{id:D}]}}),S.mergeXdm({...I}),(v||b)&&(y=!0);const R=o({edgeDomain:g,datastreamId:p,request:C});return c.onBeforeEvent({event:S}).then(()=>{try{S.finalize(m)}catch(e){throw w({error:e}),e}return k.addEvent(S),!0===t.conversation.stickyConversationSession&&i.cookiesToPayload(k,g),r({requestId:Me(),url:R,request:C,onStreamResponse:w,streamingEnabled:y}).then(e=>{if(204===e.status)return;const t=(({onStreamResponseCallback:e,streamTimeout:t})=>{let n,r=!1;const o=()=>{clearTimeout(n),n=setTimeout(()=>{r=!0,e({error:{message:`Stream timeout: No data received within ${t/1e3} seconds`}})},t)};return o(),{onEvent:t=>{r||(o(),e(t))},onPing:()=>{r||o()},onComplete:()=>{clearTimeout(n)}}})({onStreamResponseCallback:e=>{if(e.error)return n.error(\"Stream error occurred\",e.error),void w({error:e.error});const t=e.data.replace(\"data: \",\"\"),r=JSON.parse(t),o=a({content:r});i.responseToCookies(o),n.info(\"onStreamResponse callback called with\",o.getPayloadsByType(\"brand-concierge:conversation\")),w(o.getPayloadsByType(\"brand-concierge:conversation\"))},streamTimeout:f.streamTimeout}),r=(()=>{const e=/\\r\\n|\\r|\\n/,t=/\\r\\n\\r\\n|\\n\\n|\\r\\r/,n=e=>e.trim().startsWith(\": ping\"),r=t=>{const n=t.split(e),r={};for(const e of n){const t=e.trim();if(!t)continue;const n=t.indexOf(\":\");if(-1===n)continue;const o=t.substring(0,n).trim(),i=t.substring(n+1).trim();\"data\"===o?r.data=(r.data||\"\")+i:\"event\"===o?r.type=i:\"id\"===o&&(r.id=i)}return r.data?r:null};return async(e,{onEvent:o,onPing:i,onComplete:a})=>{const s=e.getReader(),c=new TextDecoder(\"utf-8\");let d=\"\";try{for(;;){const{done:e,value:a}=await s.read();if(e)break;d+=c.decode(a,{stream:!0});const l=d.split(t);d=l.pop()||\"\";for(const e of l){const t=e.trim();if(!t)continue;if(n(t)){i();continue}const a=r(t);null!==a&&o(a)}}const e=d.trim();if(!e)return void a();if(n(e))return i(),void a();const l=r(e);null!==l&&o(l),a()}catch(e){o({error:e}),a()}finally{s.releaseLock()}}})();r(e.body,t)})})}},zi=Ct({conversation:Ct({stickyConversationSession:wt().default(!1),streamTimeout:Et().integer().minimum(Fi).default(Fi),collectSources:wt().default(!1),region:St().matches(/^[a-z]{2,4}[0-9]{1,2}$/i)}).default({stickyConversationSession:!1,streamTimeout:Fi,collectSources:!1})});const Ji=({loggingCookieJar:e,logger:t,eventManager:n,consent:r,instanceName:o,sendEdgeNetworkRequest:i,config:a,lifecycle:s,cookieTransfer:c,createResponse:d,platformServices:l})=>{const u={id:Vi({loggingCookieJar:e,config:a})},g=(({queryString:e})=>({edgeDomain:t,request:n,datastreamId:r})=>{const o=n.getRequestParams(),i=n.getDatastreamIdOverride()||r;o.requestId=n.getId(),o.configId=i;const a=e.stringify({...o});return`https://${t}${n.getEdgeSubPath()}/${n.getAction()}?${a}`})({queryString:be}),p=(({logger:e,fetch:t})=>async({requestId:n,url:r,request:o,streamingEnabled:i=!0})=>{const a=o.getPayload(),s=JSON.stringify(a),c=JSON.parse(s),d={\"Content-Type\":\"text/plain\"};d.Accept=i?\"text/event-stream\":\"text/plain\",e.logOnBeforeNetworkRequest({url:r,requestId:n,payload:c});const l=async(o=1)=>{const i=[2e3,3e3,5e3];try{const e=await t(r,{method:\"POST\",headers:d,body:s});if(!e.ok)throw new Error(`Request failed with status ${e.status}`);return e}catch(t){if(o<4){const a=i[o-1];return e.logOnNetworkError({requestId:n,url:r,payload:c,error:new Error(`Attempt ${o} failed, retrying in ${a}ms: ${t.message}`)}),await new Promise(e=>setTimeout(e,a)),l(o+1)}throw e.logOnNetworkError({requestId:n,url:r,payload:c,error:t}),Pe({error:t,message:\"Network request failed after all retries.\"})}};return(async()=>l())()})({logger:t,fetch:fetch,config:a}),m=qt({orgId:a.orgId,cookieJar:e,logger:t}),f=Hi({logger:t,eventManager:n,consent:r,config:a,buildEndpointUrl:g,lifecycle:s,cookieTransfer:c,createResponse:d,sendConversationServiceRequest:p,decodeKndctrCookie:m,session:u,getPageLocation:l.globals.getPageLocation});return{lifecycle:{onBeforeEvent({event:e}){if(a.conversation.collectSources){const t=be.parse(l.globals.getLocationSearch()).adobe_brand_concierge_source;t&&e.mergeXdm({channel:{referringSource:t}})}}},commands:{sendConversationEvent:{optionsValidator:e=>(({options:e})=>ht([Ct({message:St().required(),xdm:Ti,onStreamResponse:It().default(me),voiceEnabled:wt().default(!1)}),Ct({xdm:Ti,voiceEnabled:wt().default(!1)}).required(),Ct({data:Ct({type:St().required(),payload:Ct({})}).required(),onStreamResponse:It().default(me),voiceEnabled:wt().default(!1)})])(e))({options:e}),run:f}}}};Ji.namespace=\"BrandConcierge\",Ji.configValidators=zi;var Xi=({eventManager:e,lifecycle:t,handleError:n})=>{const r=(({eventManager:e,lifecycle:t,handleError:n})=>r=>{if(r.s_fe)return Promise.resolve();const o=\"composedPath\"in r&&r.composedPath().length>0?r.composedPath()[0]:r.target,i=e.createEvent();return i.documentMayUnload(),t.onClick({event:i,clickedElement:o}).then(()=>i.isEmpty()?Promise.resolve():e.sendEvent(i)).then(me).catch(e=>{n(e,\"click collection\")})})({eventManager:e,lifecycle:t,handleError:n});document.addEventListener(\"click\",r,!0)};const Gi=\"\\\\.(exe|zip|wav|mp3|mov|mpg|avi|wmv|pdf|doc|docx|xls|xlsx|ppt|pptx)$\",Qi=St().regexp().default(Gi),Wi=Ct({clickCollectionEnabled:wt().default(!0),clickCollection:Ct({internalLinkEnabled:wt().default(!0),externalLinkEnabled:wt().default(!0),downloadLinkEnabled:wt().default(!0),sessionStorageEnabled:wt().default(!1),eventGroupingEnabled:wt().default(!1),filterClickProperties:It()}).default({internalLinkEnabled:!0,externalLinkEnabled:!0,downloadLinkEnabled:!0,sessionStorageEnabled:!1,eventGroupingEnabled:!1}),downloadLinkQualifier:Qi,onBeforeLinkClickSend:It().deprecated('The field \"onBeforeLinkClickSend\" has been deprecated. Use \"clickCollection.filterClickDetails\" instead.')});var Ki=(e=document)=>null!==e.getElementById(\"cppXYctnr\"),Yi=e=>{let t=e;/^https?:\\/\\//i.test(t)||(t=`${window.location.protocol}//${e}`);return new URL(t).hostname};var Zi=({config:e,logger:t,getClickedElementProperties:n,clickActivityStorage:r})=>{const{clickCollectionEnabled:o,clickCollection:i}=e;return o?({event:o,clickedElement:a})=>{const s=n({clickActivityStorage:r,clickedElement:a,config:e,logger:t}),c=s.linkType;var d,l;Ki()||(s.isValidLink()&&((e,t)=>t&&(\"download\"===t&&!e.downloadLinkEnabled||\"exit\"===t&&!e.externalLinkEnabled||\"other\"===t&&!e.internalLinkEnabled))(i,c)?t.info(`Cancelling link click event due to clickCollection.${c}LinkEnabled = false.`):s.isInternalLink()&&i.eventGroupingEnabled&&(!e.onBeforeLinkClickSend||i.filterClickDetails)&&(d=window.location.hostname,l=s.linkUrl,Yi(d)===Yi(l))?r.save(s.properties):s.isValidLink()?(o.mergeXdm(s.xdm),o.mergeData(s.data),r.save({pageName:s.pageName,pageIDType:s.pageIDType})):s.isValidActivityMapData()&&r.save(s.properties))}:()=>{}};var ea=({properties:e,logger:t}={})=>{let n=e||{};return{get pageName(){return n.pageName},set pageName(e){n.pageName=e},get linkName(){return n.linkName},set linkName(e){n.linkName=e},get linkRegion(){return n.linkRegion},set linkRegion(e){n.linkRegion=e},get linkType(){return n.linkType},set linkType(e){n.linkType=e},get linkUrl(){return n.linkUrl},set linkUrl(e){n.linkUrl=e},get pageIDType(){return n.pageIDType},set pageIDType(e){n.pageIDType=e},get clickedElement(){return n.clickedElement},set clickedElement(e){n.clickedElement=e},get properties(){return{pageName:n.pageName,linkName:n.linkName,linkRegion:n.linkRegion,linkType:n.linkType,linkUrl:n.linkUrl,pageIDType:n.pageIDType}},isValidLink:()=>!!(n.linkUrl&&n.linkType&&n.linkName&&n.linkRegion),isInternalLink(){return this.isValidLink()&&\"other\"===n.linkType},isValidActivityMapData:()=>!!n.pageName&&!!n.linkName&&!!n.linkRegion&&void 0!==n.pageIDType,get xdm(){return n.filteredXdm?n.filteredXdm:(e=>({eventType:\"web.webinteraction.linkClicks\",web:{webInteraction:{name:e.linkName,region:e.linkRegion,type:e.linkType,URL:e.linkUrl,linkClicks:{value:1}}}}))(this)},get data(){return n.filteredData?n.filteredData:(e=>({__adobe:{analytics:{contextData:{a:{activitymap:{page:e.pageName,link:e.linkName,region:e.linkRegion,pageIDType:e.pageIDType}}}}}}))(this)},applyPropertyFilter(e){e&&!1===e(n)&&(t&&t.info(`Clicked element properties were rejected by filter function: ${JSON.stringify(this.properties,null,2)}`),n={})},applyOptionsFilter(e){const r=this.options;if(r&&r.clickedElement&&(r.xdm||r.data)){if(e&&!1===e(r))return t&&t.info(`Clicked element properties were rejected by filter function: ${JSON.stringify(this.properties,null,2)}`),void(this.options=void 0);this.options=r,n.filteredXdm=r.xdm,n.filteredData=r.data}},get options(){const e={};if(this.isValidLink()&&(e.xdm=this.xdm),this.isValidActivityMapData()&&(e.data=this.data),this.clickedElement&&(e.clickedElement=this.clickedElement),e.xdm||e.data)return e},set options(e){n={},e&&((e,t)=>{const{xdm:n,data:r,clickedElement:o}=e;if(t.clickedElement=o,n&&n.web&&n.web.webInteraction){const{name:e,region:r,type:o,URL:i}=n.web.webInteraction;t.linkName=e,t.linkRegion=r,t.linkType=o,t.linkUrl=i}if(r&&r.__adobe&&r.__adobe.analytics){const{contextData:e}=r.__adobe.analytics;if(e&&e.a&&e.a.activitymap){const{page:n,link:r,region:o,pageIDType:i}=e.a.activitymap;t.pageName=n||t.pageName,t.linkName=r||t.linkName,t.linkRegion=o||t.linkRegion,void 0!==i&&(t.pageIDType=i)}}})(e,n)}}};const ta=\"clickData\";var na=e=>e&&e.replace(/\\s+/g,\" \").trim();const ra=/^(SCRIPT|STYLE|LINK|CANVAS|NOSCRIPT|#COMMENT)$/i;const oa=e=>{let t=[],n=!1;if((e=>!(e&&e.nodeName&&e.nodeName.match(ra)))(e)){if(t.push(e),e.childNodes){Array.prototype.slice.call(e.childNodes).forEach(e=>{const r=oa(e);t=t.concat(r.supportedNodes),n=n||r.includesUnsupportedNodes})}}else n=!0;return{supportedNodes:t,includesUnsupportedNodes:n}},ia=(e,t,n)=>{let r;return n&&n!==e.nodeName.toUpperCase()||(r=e.getAttribute(t)),r};const aa=/^(HEADER|MAIN|FOOTER|NAV)$/i,sa=e=>{let t;return\"region\"===e.role&&pe(e[\"aria-label\"])&&(t=e[\"aria-label\"]),t},ca=e=>{let t;return e&&e.nodeName&&e.nodeName.match(aa)&&(t=e.nodeName),t};var da=e=>!(!e.href||\"A\"!==e.tagName&&\"AREA\"!==e.tagName||e.onclick&&e.protocol&&!(e.protocol.toLowerCase().indexOf(\"javascript\")<0)),la=e=>!!e&&!!e.onclick,ua=e=>{if(\"INPUT\"===e.tagName){const t=e.getAttribute(\"type\");if(\"submit\"===t)return!0;if(\"image\"===t&&e.src)return!0}return!1},ga=e=>\"BUTTON\"===e.tagName&&\"submit\"===e.type,pa=e=>{const t=e.indexOf(\"?\"),n=e.indexOf(\"#\");return t>=0&&(t<n||n<0)?e.substring(0,t):n>=0?e.substring(0,n):e};const ma=(({window:e,getLinkName:t,getLinkRegion:n,getAbsoluteUrlFromAnchorElement:r,findClickableElement:o,determineLinkType:i})=>({clickedElement:a,config:s,logger:c,clickActivityStorage:d})=>{const{onBeforeLinkClickSend:l,clickCollection:u}=s,{filterClickDetails:g}=u,p=ea({logger:c});if(a){const c=o(a);if(c){p.clickedElement=a,p.linkUrl=r(e,c),p.linkType=i(e,s,p.linkUrl,c),p.linkRegion=n(c),p.linkName=t(c),p.pageIDType=0,p.pageName=e.location.href;const o=d.load();o&&o.pageName&&(p.pageName=o.pageName,p.pageIDType=1),g?p.applyPropertyFilter(g):l&&p.applyOptionsFilter(l)}}return p})({window:window,getLinkName:e=>{let t=na(e.innerText||e.textContent);const n=oa(e);if(!t||n.includesUnsupportedNodes){const e=(e=>{const t={texts:[]};return e.supportedNodes.forEach(e=>{e.getAttribute&&(t.alt||(t.alt=na(e.getAttribute(\"alt\"))),t.title||(t.title=na(e.getAttribute(\"title\"))),t.inputValue||(t.inputValue=na(ia(e,\"value\",\"INPUT\"))),t.imgSrc||(t.imgSrc=na(ia(e,\"src\",\"IMG\"))),t.ariaLabel||(t.ariaLabel=na(e.getAttribute(\"aria-label\"))),t.name||(t.name=na(e.getAttribute(\"name\")))),e.nodeValue&&t.texts.push(e.nodeValue)}),t})(n);t=na(e.texts.join(\"\")),t||(t=e.alt||e.title||e.inputValue||e.imgSrc||e.ariaLabel||e.name)}return t||\"\"},getLinkRegion:e=>{let t,n=e.parentNode;for(;n;){if(t=na(n.id||sa(n)||ca(n)),t)return t;n=n.parentNode}return\"BODY\"},getAbsoluteUrlFromAnchorElement:(e,t)=>{const n=e.location.href;let r=t.href||\"\";\"string\"!=typeof r&&(r=\"\");try{return new URL(r,n).href}catch{return n}},findClickableElement:e=>{let t=e;for(;t&&(!t.nodeName||\"BODY\"!==t.nodeName);){if(da(t)||la(t)||ua(t)||ga(t))return t;t=t.parentNode}return null},determineLinkType:(e,t,n,r)=>{let o=\"other\";return pe(n)&&(((e,t,n)=>{let r=!1;if(t)if(n&&n.download)r=!0;else if(e){const n=new RegExp(e),o=pa(t).toLowerCase();r=n.test(o)}return r})(t.downloadLinkQualifier,n,r)?o=\"download\":((e,t)=>{let n=!1;if(t&&e.location.hostname){const r=e.location.hostname.toLowerCase();n=pa(t).toLowerCase().indexOf(r)<0}return n})(e,n)&&(o=\"exit\")),o}});let fa;const ha=e=>{if(!fa){const n=(t=window,e=>{const n=V+e;return{session:ce(t,\"sessionStorage\",n),persistent:ce(t,\"localStorage\",n)}})(e.orgId||\"\"),r=(()=>{const e={};return{getItem:t=>e[t],setItem:(t,n)=>{e[t]=n},removeItem:t=>{delete e[t]}}})(),o=e.clickCollection.sessionStorageEnabled?n.session:r;fa=(({storage:e})=>({save:t=>{const n=JSON.stringify(t);e.setItem(ta,n)},load:()=>{let t=null;const n=e.getItem(ta);return n&&(t=JSON.parse(n)),t},remove:()=>{e.removeItem(ta)}}))({storage:o})}var t},ya=({config:e,eventManager:t,handleError:n,logger:r})=>{((e,t)=>{const{clickCollectionEnabled:n,onBeforeLinkClickSend:r,downloadLinkQualifier:o}=e;!1===n&&(r&&t.warn(\"The 'onBeforeLinkClickSend' configuration was provided but will be ignored because clickCollectionEnabled is false.\"),o&&o!==Gi&&t.warn(\"The 'downloadLinkQualifier' configuration was provided but will be ignored because clickCollectionEnabled is false.\"))})(e,r);const o=e.clickCollection;fa||ha(e);const i=Zi({config:e,logger:r,clickActivityStorage:fa,getClickedElementProperties:ma}),a=(({clickActivityStorage:e})=>t=>{if(Ki())return;const n=e.load(),r=ea({properties:n});if(r.isValidLink()||r.isValidActivityMapData()){if(r.isValidLink()){const e=r.xdm;delete e.eventType,t.mergeXdm(e)}r.isValidActivityMapData()&&t.mergeData(r.data),e.save({pageName:r.pageName,pageIDType:r.pageIDType})}})({clickActivityStorage:fa}),s=(({clickActivityStorage:e})=>t=>{e.save({pageName:t.getContent().xdm.web.webPageDetails.name,pageIDType:1})})({clickActivityStorage:fa});return{lifecycle:{onComponentsRegistered(e){const{lifecycle:r}=e;Xi({eventManager:t,lifecycle:r,handleError:n})},onClick({event:e,clickedElement:t}){i({event:e,clickedElement:t})},onBeforeEvent({event:e}){(e=>{const t=e.getContent();return void 0!==t.xdm&&void 0!==t.xdm.web&&void 0!==t.xdm.web.webPageDetails&&void 0!==t.xdm.web.webPageDetails.name})(e)&&(o.eventGroupingEnabled&&a(e),s(e,r,fa))}}}};ya.namespace=\"ActivityCollector\",ya.configValidators=Wi,ya.buildOnInstanceConfiguredExtraParams=({config:e,logger:t})=>(fa||ha(e),{getLinkDetails:n=>ma({clickActivityStorage:fa,clickedElement:n,config:e,logger:t}).properties});var va=Ct({advertising:Ct({id5PartnerId:St(),rampIdJSPath:St(),dspEnabled:wt(),advertiserSettings:vt(Ct({advertiserId:St().required(),enabled:wt().required()}).noUnknownFields())}).noUnknownFields()});const wa=\"advertising\",Ia=\"_les_lsc\",ba=\"lastConversionTime\",Ea=\"displayClickCookieExpires\",ka=\"rampIdExpires\",Ca=\"surferId\",Sa=\"hashedIp\",Pa=\"hashedIPAddr\",Da=\"rampId\",Ra=\"id5Id\",Ta=\"advertising.enrichment\",Oa=\"trackingCode\",Ma=\"trackingIdentities\",Na=\"Ad conversion submission failed\",Aa=\"ev_lcc\";var xa=({orgId:e,logger:t,cookieJar:n})=>{const r=d({logger:t,cookieJar:n}),o=(t,n=!0)=>n?G(e,t):t,i=(e=30)=>new Date(Date.now()+60*e*1e3),a=(e,n=!0)=>{try{const t=o(e,n),i=r.get(t);return i?(e=>{try{if(e?.startsWith(\"%7B\")||e?.startsWith(\"{\"))return JSON.parse(decodeURIComponent(e))}catch{}return e})(i):null}catch(n){return t.error(`Error reading cookie: ${e}`,n),null}},s=(e,n,i={},a=!0)=>{try{const t=o(e,a),s=(e=>\"object\"==typeof e&&null!==e?encodeURIComponent(JSON.stringify(e)):e)(n);return r.set(t,s,i),!0}catch(n){return t.error(`Error writing cookie: ${e}`,n),!1}};return{setValue:(e,t,n={})=>{const r={...a(wa)||{},[e]:t};return s(wa,r,{expires:i(527040),...n})},getValue:e=>(a(wa)||{})[e]}};var qa=({cookieManager:e,logger:t,componentConfig:n,getBrowser:r,consent:o,collectSurferId:i,getID5Id:a,getRampId:s,appendAdvertisingIdQueryToEvent:c,appendAdCloudIdentityToEvent:d,collectHashedIPAddr:l,getUrlParams:u,isThrottled:g,normalizeAdvertiser:p})=>async({event:m,advertising:f={}})=>{const{state:h}=o.current();if(\"in\"!==h)return;const{skwcid:y,efid:v}=u(),w=!(!y||!v),I=p(n?.advertiserSettings).length>0;if(!((e=>![Ft,Bt].includes(e?.handleAdvertisingData?.toLowerCase()))(f)||w||!I||g(Ca,e)&&g(Ra,e)&&g(Da,e)))try{const o=(e=>e?.handleAdvertisingData?.toLowerCase()===Bt)(f);let u=null;r&&r()===W||(u=s(t,n.rampIdJSPath,e,o,o));const p=n.id5PartnerId?a(t,n.id5PartnerId,o,o):Promise.resolve(null),[h,y,v,w]=await Promise.allSettled([i(o),l(),p,u]),I={},b={};if(\"fulfilled\"===h.status&&h.value&&(b[Ca]=h.value,g(Ca,e)||(I[Ca]=h.value)),\"fulfilled\"===y.status&&y.value&&(b[Sa]=y.value,g(Ca,e)||(I[Sa]=y.value)),\"fulfilled\"===v.status&&v.value&&!g(Ra,e)&&(I.id5Id=v.value),\"fulfilled\"===w.status&&w.value&&!g(Da,e)&&(I.rampId=w.value),0!==Object.keys(b).length&&d(b,m),0===Object.keys(I).length&&(g(Ca,e)||g(Ra,e)||g(Da,e)))return;c(I,m,e,n)}catch(e){t.error(\"Error in onBeforeSendEvent hook:\",e)}};const $a=15,La=3e4,_a=500,Ua=5e3,ja=2e3,Ba={rampIdEnv:void 0,rampIdCallInitiated:!1,inProgressRampIdPromise:null,envelopeRetrievalInProgress:!1},Fa=(e,t,n,r)=>{let o;try{o=JSON.parse(e).envelope}catch{o=e}o&&!Ba.rampIdCallInitiated?(Ba.rampIdCallInitiated=!0,Ba.rampIdEnv=o,Ba.envelopeRetrievalInProgress=!1,Ba.inProgressRampIdPromise=null,n.setValue(Da,Ba.rampIdEnv),n.setValue(ka,Date.now()+1728e5),t(Ba.rampIdEnv)):(r.warn(\"Invalid RampID envelope received\",{envelope:o}),Ba.envelopeRetrievalInProgress=!1)},Va=(e,t,n,r=!1)=>{if(Ba.inProgressRampIdPromise)return Ba.inProgressRampIdPromise;const o=r?ja:La;let i=!1;const a=new Promise((r,o)=>{q(e,{onLoad:()=>{void 0===window.ats||Ba.envelopeRetrievalInProgress||(Ba.envelopeRetrievalInProgress=!0,window.ats.retrieveEnvelope().then(e=>{e?i||Fa(e,r,t,n):(Ba.envelopeRetrievalInProgress=!1,window.addEventListener(\"lrEnvelopePresent\",()=>{Ba.envelopeRetrievalInProgress||i||(Ba.envelopeRetrievalInProgress=!0,window.ats.retrieveEnvelope().then(e=>{i||Fa(e,r,t,n)},e=>{i||(n.error(\"Failed to retrieve envelope after event\",e),Ba.envelopeRetrievalInProgress=!1,o(e),Ba.inProgressRampIdPromise=null)}))}))}).catch(e=>{i||(n.error(\"Error retrieving envelope\",e),Ba.envelopeRetrievalInProgress=!1,o(e),Ba.inProgressRampIdPromise=null)})),((e,t,n,r)=>{let o=$a,i=1,a=0;const s=()=>{if(Ba.rampIdEnv)return;if(a>La)return r.error(\"Maximum retry time exceeded\"),Ba.envelopeRetrievalInProgress=!1,t(new Error(\"Failed to retrieve RampID - timeout\")),void(Ba.inProgressRampIdPromise=null);if(0===o)return r.error(\"Maximum retries exceeded\"),Ba.envelopeRetrievalInProgress=!1,t(new Error(\"Failed to retrieve RampID after maximum retries\")),void(Ba.inProgressRampIdPromise=null);const c=Math.min(_a*i,Ua);setTimeout(()=>{a+=c,o-=1,i+=1,void 0===window.ats||null===window.ats||Ba.rampIdEnv||Ba.envelopeRetrievalInProgress?s():(Ba.envelopeRetrievalInProgress=!0,window.ats.retrieveEnvelope().then(t=>{Fa(t,e,n,r),Ba.rampIdEnv||s()},()=>{r.warn(\"Failed to retrieve envelope\"),Ba.envelopeRetrievalInProgress=!1,s()}))},c)};s()})(e=>{i||r(e)},e=>{i||o(e)},t,n)},onError:e=>{i||o(e),Ba.inProgressRampIdPromise=null}})}),s=new Promise(e=>{setTimeout(()=>{i=!0,e(null)},o)});return Ba.inProgressRampIdPromise=Promise.race([a,s]).finally(()=>{Ba.inProgressRampIdPromise=null}),Ba.inProgressRampIdPromise},Ha=(e,t,n,r=!0,o=!1)=>{if(Ba.rampIdEnv)return Promise.resolve(Ba.rampIdEnv);if(n){const e=n.getValue(Da),t=n.getValue(ka);if(e&&t&&t>Date.now())return Ba.rampIdEnv=e,Promise.resolve(e)}return r&&null!=t?Va(t,n,e,o):Promise.resolve(null)};let za=\"\",Ja=null;const Xa=function(e,t,n=!0,r=!1){return za&&\"\"!==za?Promise.resolve(za):n?((e,t,n)=>{if(e=Math.floor(Number(e)),Ja)return Ja;const r=t?2e3:3e4;let o=!1;const i=new Promise((t,r)=>{if(!e)return n.error(\"Missing partner ID\"),void r(new Error(\"ID5 partner ID is required\"));const i=()=>{try{if(void 0===window.ID5)return void r(new Error(\"ID5 object not available after script load\"));const i=window.ID5.init({partnerId:e});za=i.getUserId();const a=e=>{o||t(e)};za?a(za):window.ID5.init({partnerId:e}).onAvailable(function(t){za=t.getUserId(),za?a(za):window.ID5.init({partnerId:e}).onAvailable(function(e){za=e.getUserId(),za?a(za):(n.error(\"Failed to get ID5 ID after all retries\"),a(null))})},1e3)}catch(e){n.error(\"Error during ID5 initialization\",e),r(e)}};void 0!==window.ID5?i():q(\"https://www.everestjs.net/static/id5-api.js\",{onLoad:i,onError:e=>{n.error(\"Script loading failed\",e),r(e)}})}),a=new Promise(e=>{setTimeout(()=>{o=!0,e(null)},r)});return Ja=Promise.race([i,a]).finally(()=>{Ja=null}),Ja})(t,r,e).then(e=>e).catch(t=>{throw e.error(\"Failed to get ID5 ID\",t),t}):Promise.resolve(null)},Ga=()=>{const e=be.parse(window.location.search);return{skwcid:e.s_kwcid,efid:e.ef_id}},Qa=e=>e&&Array.isArray(e)?e.filter(e=>e&&!0===e.enabled&&e.advertiserId).map(e=>e.advertiserId).join(\", \"):\"\",Wa=(e,t)=>{const n=[Ca,Sa,Ra,Da,\"adfId\"].map(t=>e[t]??\"\").join(\"|\");t.mergeXdm({_experience:{adcloud:{stitchId:n}}})},Ka=(e,t,n,r,o=!1)=>{const i=n.getValue(Ia);let a=null;const s=n.getValue(Ea);s&&s>Date.now()&&(a=n.getValue(Aa));const c={advertising:{...i?.click_time&&{lastSearchClick:i.click_time},...a&&{lastDisplayClick:a},stitchIds:{...e[Ca]&&{surferId:e[Ca]},...e[Ra]&&{id5:e[Ra]},...e[Da]&&{rampIdEnv:e[Da]},...e[Sa]&&{hashedIp:e[Sa]}},advIds:Qa(r.advertiserSettings),...o&&{eventType:Ta}}};return t.mergeQuery(c),t},Ya=(e,t)=>{const n=Date.now(),r=t.getValue(`${e}_last_conversion`);return Boolean(r&&n-r<18e5)};async function Za({eventManager:e,cookieManager:t,logger:n,componentConfig:r,adConversionHandler:o,getBrowser:i,collectSurferId:a,collectHashedIPAddr:s}){const c={},d={},l=s?s().catch(()=>null):Promise.resolve(null),u=async()=>{if(i=c,a=d,!Object.entries(i).some(([e])=>!a[e]))return null;var i,a;const s=await l,u=s?{...c,[Sa]:s}:{...c},g=Object.keys(c);try{const i=Ka(u,e.createEvent(),t,r,!0),a={eventType:Ta,timestamp:(new Date).toISOString()};i.setUserXdm(a);const s=await o.trackAdConversion({event:i});return((e,t,n,r)=>{const o=Date.now();e.forEach(e=>{t[e]=!0,n.setValue(`${e}_last_conversion`,o),r.info(\"Ad conversion submitted successfully\".replace(\"{0}\",e))}),n.setValue(ba,o)})(g,d,t,n),s}catch(e){return n.error(Na,e),null}},g=((e,t,n,r,o)=>{const i={};return Ya(Ca,n)||(i.surferId=o(!0).catch(()=>null)),t.id5PartnerId&&t.dspEnabled&&!Ya(Ra,n)&&(i.id5Id=Xa(e,t.id5PartnerId).catch(()=>null)),t.rampIdJSPath&&t.dspEnabled&&!Ya(Da,n)&&(i.rampId=Ha(e,t.rampIdJSPath,n,!0).catch(()=>null)),i})(n,r,t,0,a);if(0===Object.keys(g).length)return[];const p=Object.entries(g).map(([e,t])=>t.then(t=>{if(t)return c[e]=t,u()}).catch(t=>(n.error(\"Unable to obtain ad identity\".replace(\"{0}\",e),t),null)));return Promise.allSettled(p)}var es=({eventManager:e,cookieManager:t,adConversionHandler:n,logger:r,componentConfig:o,getBrowser:i,consent:a,collectSurferId:s,collectHashedIPAddr:c})=>{const d=o?.advertiserSettings?Qa(o.advertiserSettings):\"\";return async()=>{try{await a.awaitConsent();const{skwcid:l,efid:u}=Ga();if(!(!l&&!u))return async function({eventManager:e,cookieManager:t,adConversionHandler:n,logger:r,skwcid:o,efid:i}){const a=Array.isArray(o)?o[0]:o,s=Array.isArray(i)?i[0]:i;r.info(\"Processing ad conversion\",{skwcid:a,efid:s});const c=e.createEvent();if(void 0!==a&&void 0!==s&&a.startsWith(\"AL!\")){const e={click_time:Date.now(),skwcid:a,efid:s};t.setValue(Ia,e)}const d={_experience:{adcloud:{conversionDetails:{...void 0!==a&&{[Oa]:a},...void 0!==s&&{[Ma]:s}}}},eventType:\"advertising.enrichment_ct\",timestamp:(new Date).toISOString()};c.setUserXdm(d),t.setValue(ba),t.setValue(\"lastConversionTimeExpires\",Date.now()+78624e5);try{return await n.trackAdConversion({event:c})}catch(e){throw r.error(Na,e),e}}({eventManager:e,cookieManager:t,adConversionHandler:n,logger:r,skwcid:l,efid:u});d&&Za({eventManager:e,cookieManager:t,logger:r,componentConfig:o,adConversionHandler:n,getBrowser:i,collectSurferId:s,collectHashedIPAddr:c}).catch(e=>r.error(\"Error in view through:\",e))}catch(e){r.error(\"Error in sendAdConversion:\",e)}}};const ts={height:0,width:0,frameBorder:0,style:{display:\"none\"}},ns=0xffffffffffffffffn,rs=(e,t)=>(e<<BigInt(t)|e>>BigInt(64-t))&ns,os=e=>BigInt(255&e),is=(e,t)=>{let n=0n;for(let r=0;r<8;r+=1)n|=os(e[t+r])<<8n*BigInt(r);return n&ns},as=0x87c37b91114253d5n,ss=0x4cf5ad432745937fn,cs=e=>{let t=e&ns;return t=t*as&ns,t=rs(t,31),t=t*ss&ns,t},ds=e=>{let t=e&ns;return t=t*ss&ns,t=rs(t,33),t=t*as&ns,t},ls=e=>{let t=e&ns;return t^=t>>33n,t=0xff51afd7ed558ccdn*t&ns,t^=t>>33n,t=0xc4ceb9fe1a85ec53n*t&ns,t^=t>>33n,t&ns},us=(e,t=0)=>{const n=(e=>BigInt.asIntN(64,BigInt.asIntN(32,BigInt(Math.trunc(Number(e))))))(t)&ns;let r=n,o=n,i=0;const a=(new TextEncoder).encode(e),s=(e,t)=>{r^=cs(e),r=rs(r,27),r=r+o&ns,r=5n*r+0x52dce729n&ns,o^=ds(t),o=rs(o,31),o=o+r&ns,o=5n*o+0x38495ab5n&ns};let c=0;const d=Math.floor(a.length/16);for(let e=0;e<d;e+=1)s(is(a,c),is(a,c+8)),c+=16,i+=16;const l=a.length-c;i+=l;let u=0n,g=0n;const p=c;switch(l){case 15:g^=os(a[p+14])<<48n;case 14:g^=os(a[p+13])<<40n;case 13:g^=os(a[p+12])<<32n;case 12:g^=os(a[p+11])<<24n;case 11:g^=os(a[p+10])<<16n;case 10:g^=os(a[p+9])<<8n;case 9:g^=os(a[p+8]);case 8:u^=is(a,p);break;case 7:u^=os(a[p+6])<<48n;case 6:u^=os(a[p+5])<<40n;case 5:u^=os(a[p+4])<<32n;case 4:u^=os(a[p+3])<<24n;case 3:u^=os(a[p+2])<<16n;case 2:u^=os(a[p+1])<<8n;case 1:u^=os(a[p])}r^=cs(u),o^=ds(g);const m=BigInt(i>>>0);r^=m,o^=m,r=r+o&ns,o=o+r&ns,r=ls(r),o=ls(o),r=r+o&ns,o=o+r&ns;const f=new Uint8Array(16),h=(e,t)=>{let n=e&ns;for(let e=0;e<8;e+=1)f[t+e]=Number(0xffn&n),n>>=8n};return h(r,0),h(o,8),[...f].map(e=>e.toString(16).padStart(2,\"0\")).join(\"\")};const gs=({logger:e,config:t,eventManager:n,sendEdgeNetworkRequest:r,consent:o,getBrowser:i,platformServices:a})=>{const s=t.advertising,c=xa({orgId:t.orgId,logger:e,cookieJar:a.cookie}),d=(({appendNode:e=g,awaitSelector:t=N,createNode:n=p}={})=>{let r=null;return()=>r||(r=new Promise((r,o)=>{const i=\"https:\"===document.location.protocol?\"https:\":\"http:\",a=`${i}//www.everestjs.net/static/pixel_details.html#${new URLSearchParams({google:\"__EFGCK__\",gsurfer:\"__EFGSURFER__\",imsId:\"__EFIMSORGID__\",is_fb_cookie_synced:\"__EFFB__\",optout:\"__EFOPTOUT__\",throttleCookie:\"__EFSYNC__\",time:\"__EFTIME__\",ev_lcc:\"__LCC__\",clientIp:\"__EFREMOTEADDR__\"}).toString()}`,s=`${i}//pixel.everesttech.net/1/gr?${new URLSearchParams({ev_gb:\"0\",url:a}).toString()}`,c=n(\"iframe\",{src:s},ts,[]);let d;const l=e=>{if(e.origin.includes(\"www.everestjs.net\")){clearTimeout(d),window.removeEventListener(\"message\",l,!1);try{const t=e.data,n=t.indexOf(\"#\");if(-1===n)return void r({surferId:null,displayClickCookie:null,clientIp:\"\"});const o=new URLSearchParams(t.substring(n+1)),i=o.get(\"gsurfer\")||null,a=o.get(\"clientIp\")||\"\",s=o.get(Aa);r({surferId:i,displayClickCookie:s&&\"__LCC__\"!==s?s:null,clientIp:a})}catch(e){o(e)}}};d=setTimeout(()=>{window.removeEventListener(\"message\",l,!1),o(new Error(\"Advertising identity call timed out\"))},5e3),window.addEventListener(\"message\",l,!1),t(m).then(([t])=>{e(t,c)})}).finally(()=>{r=null}),r)})(),l=(({initiateAdvertisingIdentityCall:e,cookieManager:t,getBrowser:n})=>{let r=t.getValue(Ca)||\"\";return(o=!0)=>r?Promise.resolve(r):o?e().then(e=>{const o=!n||ie({getBrowser:n})();return e&&o&&(e.surferId&&(r=e.surferId,t.setValue(Ca,e.surferId)),e.displayClickCookie&&(t.setValue(Aa,e.displayClickCookie),t.setValue(Ea,Date.now()+9e5))),o?e.surferId:null}):Promise.resolve(null)})({initiateAdvertisingIdentityCall:d,cookieManager:c,getBrowser:i}),u=(({cookieManager:e,hash:t=us})=>{let n=e.getValue(Pa)||\"\";const r=r=>{r&&(n=t(r),e.setValue(Pa,n))};return{captureFromIframe:r,get:()=>n,collect:e=>n?Promise.resolve(n):e().then(e=>(r(e.clientIp),n))}})({cookieManager:c}),f=(({sendEdgeNetworkRequest:e,consent:t,createDataCollectionRequest:n,createDataCollectionRequestPayload:r,logger:o})=>({trackAdConversion:({event:i})=>{const a=r();a.addEvent(i),i.finalize();const s=n({payload:a});return t.awaitConsent().then(()=>e({request:s}).then(()=>({success:!0})).catch(e=>{throw o.error(\"Failed to send ad conversion event\",e),e}))}}))({sendEdgeNetworkRequest:r,consent:o,createDataCollectionRequest:un,createDataCollectionRequestPayload:mn,logger:e});return(({handleOnBeforeSendEvent:e,sendAdConversionHandler:t})=>({lifecycle:{onComponentsRegistered(){t()},onBeforeEvent:e}}))({handleOnBeforeSendEvent:qa({cookieManager:c,logger:e,getBrowser:i,consent:o,componentConfig:s,collectSurferId:l,getID5Id:Xa,getRampId:Ha,appendAdvertisingIdQueryToEvent:Ka,appendAdCloudIdentityToEvent:Wa,collectHashedIPAddr:()=>u.collect(d),getUrlParams:Ga,isThrottled:Ya,normalizeAdvertiser:Qa}),sendAdConversionHandler:es({eventManager:n,cookieManager:c,adConversionHandler:f,logger:e,componentConfig:s,getBrowser:i,consent:o,collectSurferId:l,collectHashedIPAddr:()=>u.collect(d)})})};gs.namespace=\"Advertising\",gs.configValidators=va;const ps=e=>e.filter((t,n)=>e.indexOf(t)===n);var ms=({getPageLocation:t,renderDecisions:n,decisionScopes:r,personalization:o,event:i,isCacheInitialized:a,logger:s})=>{const c=i.getViewName();return{isRenderDecisions:()=>n,isSendDisplayEvent:()=>!!o.sendDisplayEvent,shouldIncludeRenderedPropositions:()=>!!o.includeRenderedPropositions,getViewName:()=>c,hasScopes:()=>r.length>0||I(o.decisionScopes),hasSurfaces:()=>I(o.surfaces),hasViewName:()=>pe(c),createQueryDetails(){const n=[...r];I(o.decisionScopes)&&n.push(...o.decisionScopes);const i=((t=[],n,r)=>t.map(e=>ji(e,n,r)).filter(t=>!e(t)).map(_i))(o.surfaces,t,s);this.shouldRequestDefaultPersonalization()&&((e=>{e.includes(cn)||e.push(cn)})(n),((e,t)=>{const n=Ui(t);e.includes(n)||e.push(n)})(i,t));const a=[$o,_o,Uo,Bo,jo,Fo,\"https://ns.adobe.com/personalization/message/content-card\"];return n.includes(cn)&&a.push(Lo),{schemas:a,decisionScopes:ps(n),surfaces:ps(i)}},isCacheInitialized:()=>a,shouldFetchData(){return this.hasScopes()||this.hasSurfaces()||this.shouldRequestDefaultPersonalization()},shouldUseCachedData(){return this.hasViewName()&&!this.shouldFetchData()},shouldRequestDefaultPersonalization(){return o.defaultPersonalizationEnabled||!this.isCacheInitialized()&&!1!==o.defaultPersonalizationEnabled}}};const fs={propositions:[]};var hs=({getPageLocation:e,logger:t,fetchDataHandler:n,viewChangeHandler:r,onClickHandler:o,isAuthoringModeEnabled:i,mergeQuery:a,viewCache:s,showContainers:c,applyPropositions:d,setTargetMigration:l,mergeDecisionsMeta:u,renderedPropositions:g,onDecisionHandler:p,handleConsentFlicker:m})=>({lifecycle:{onComponentsRegistered(){m()},onDecision:p,onBeforeRequest:({request:e})=>(l(e),Promise.resolve()),onBeforeEvent({event:o,renderDecisions:d,decisionScopes:l=[],personalization:p={},onResponse:m=me,onRequestFailure:f=me}){if(m(()=>({propositions:[]})),f(()=>c()),i())return t.warn(\"Rendering is disabled for authoring mode.\"),a(o,{enabled:!1}),Promise.resolve();const h=ms({getPageLocation:e,renderDecisions:d,decisionScopes:l,personalization:p,event:o,isCacheInitialized:s.isInitialized(),logger:t}),y=[];if(h.shouldIncludeRenderedPropositions()&&y.push(g.clear()),h.shouldFetchData()){const e=s.createCacheUpdate(h.getViewName());f(()=>e.cancel());const t=o.getUserIdentityMap();n({cacheUpdate:e,personalizationDetails:h,event:o,onResponse:m,identityMap:t})}else h.shouldUseCachedData()&&y.push(r({personalizationDetails:h,event:o,onResponse:m,onRequestFailure:f}));return Promise.all(y).then(e=>{const t=e.flatMap(e=>e);I(t)&&u(o,t,[Go.DISPLAY])})},onClick({event:e,clickedElement:t}){o({event:e,clickedElement:t})}},commands:{applyPropositions:{optionsValidator:e=>(({logger:e,options:t})=>{const n=Ct({propositions:vt(Ct({id:St().required(),scope:St().required(),scopeDetails:Ct({decisionProvider:St().required()}).required(),items:vt(Ct({id:St().required(),schema:St().required(),data:Ct(yt())})).nonEmpty().required()}).required()).nonEmpty().required(),metadata:Ct(yt()),viewName:St()}).required();try{return n(t)}catch(t){return e.warn(\"Invalid options for applyPropositions. No propositions will be applied.\",t),fs}})({logger:t,options:e}),run:d}}}),ys=(e=\"undefined\")=>p(\"DIV\",{},{innerHTML:e});const vs=/:eq\\((\\d+)\\)/g,ws=e=>-1===e.indexOf(\":eq(\"),Is=/(#|\\.)(-?\\w+)/g,bs=(e,t,n)=>`${t}${CSS.escape(n)}`,Es=e=>{const t=[],n=(e=>e.split(vs).filter(pe))((e=>e.replace(Is,bs))(e.trim())),{length:r}=n;let o=0;for(;o<r;){const e=n[o],r=n[o+1];r?t.push({sel:e,eq:Number(r)}):t.push({sel:e}),o+=2}return t},ks=e=>{const t=document;if(ws(e))return D(e,t);const n=Es(e),{length:r}=n;let o=[],i=t,a=0;for(;a<r;){const{sel:e,eq:t}=n[a],s=D(e,i),{length:c}=s;if(0===c)break;if(null!=t&&t>c-1)break;a<r-1&&(null==t?[i]=s:i=s[t]),a===r-1&&(o=null==t?s:[s[t]]),a+=1}return o};var Cs=(e,t=document)=>t.getElementById(e),Ss=(e,t,n)=>{e.setAttribute(t,n)},Ps=(e,t)=>e.getAttribute(t),Ds=(e,t,n,r)=>{let o;o=r?`${t}:${n} !${r};`:`${t}:${n};`,e.style.cssText+=`;${o}`},Rs=e=>e.parentNode,Ts=(e,t)=>{if(!e)return;const n=Rs(e);n&&n.insertBefore(t,(e=>e.nextElementSibling)(e))},Os=(e,t)=>{if(!e)return;const n=Rs(e);n&&n.insertBefore(t,e)},Ms=e=>{const{childNodes:t}=e;return t?b(t):[]},Ns=e=>e.firstElementChild;let As;var xs=(e=document)=>{if(void 0===As){const t=e.querySelector(\"[nonce]\");As=t&&(t.nonce||t.getAttribute(\"nonce\"))}return As};const qs=\"src\",$s=e=>p(f,{src:e}),Ls=e=>{D(f,e).forEach(e=>{const t=Ps(e,qs);t&&$s(t)})},_s=e=>((e,t)=>e.tagName===t)(e,h)&&!Ps(e,qs);var Us=e=>{const t=D(h,e),{length:n}=t,r=xs();if(r)for(let e=0;e<n;e+=1){const n=t[e];_s(n)&&(n.nonce=r)}};const js=e=>{const t=Ps(e,qs),n=document.createElement(\"script\"),{attributes:r}=e;for(let e=0;e<r.length;e+=1){const{name:t,value:o}=r[e];n.setAttribute(t,o)}const o=xs();o&&n.setAttribute(\"nonce\",o),n.async=!0;const i=((e,t)=>new Promise((n,r)=>{t.onload=()=>{n(t)},t.onerror=()=>{r(new Error(`Failed to load script: ${e}`))}}))(t,n);return document.head.appendChild(n),i},Bs=(e,t)=>!!e&&e.tagName===t,Fs=e=>Bs(e,y)&&!Ps(e,qs),Vs=e=>Bs(e,y)&&Ps(e,qs),Hs=e=>{const t=D(y,e),n=[],{length:r}=t,o=xs(),i={...o&&{nonce:o}};for(let e=0;e<r;e+=1){const r=t[e];if(!Fs(r))continue;const{textContent:o}=r;o&&n.push(p(y,i,{textContent:o}))}return n},zs=e=>{const t=D(y,e),n=[],{length:r}=t;for(let e=0;e<r;e+=1){const r=t[e];Vs(r)&&n.push(r)}return n},Js=(e,t)=>{t.forEach(t=>{e.appendChild(t),e.removeChild(t)})},Xs=e=>Promise.all(e.map(js));var Gs=(e,t,n)=>{const r=ys(t);Us(r);const o=Ms(r),i=Hs(r),a=zs(r);return Ls(r),o.forEach(t=>{g(e,t)}),n(e),Js(e,i),Xs(a)};var Qs=(e,t,n)=>((e=>{Ms(e).forEach($)})(e),Gs(e,t,n)),Ws=(e,t,n)=>{const r=ys(t);Us(r);const o=Ms(r),i=Hs(r),a=zs(r),{length:s}=o;let c=s-1;for(Ls(r);c>=0;){const t=o[c];n(t);const r=Ns(e);r?Os(r,t):g(e,t),c-=1}return Js(e,i),Xs(a)};const Ks=\"alloy-prehiding\",Ys={},Zs=e=>{if(Ys[e])return;const t=xs(),n={...t&&{nonce:t}},r=p(h,n,{textContent:`${e} { visibility: hidden }`});g(document.head,r),Ys[e]=r},ec=e=>{const t=Ys[e];t&&($(t),delete Ys[e])};var tc=(e,t,n)=>{n(e),e.textContent=t},nc=(e,t,n)=>{const r=ys(t);Us(r);const o=Ms(r),i=Hs(r),a=zs(r);return Ls(r),o.forEach(t=>{n(t),Os(e,t)}),Js(e,i),Xs(a)},rc=(e,t,n)=>nc(e,t,n).then(()=>{$(e)}),oc=(e,t,n)=>{const r=ys(t);Us(r);const o=Ms(r),i=Hs(r),a=zs(r);Ls(r);let s=e;return o.forEach(e=>{n(e),Ts(s,e),s=e}),Js(e,i),Xs(a)},ic=(e,t,n)=>{const{priority:r,...o}=t;Object.keys(o).forEach(t=>{Ds(e,t,o[t],r)}),n(e)},ac=(e,t,n)=>{Object.keys(t).forEach(n=>{Ss(e,n,t[n])}),n(e)},sc=(e,t,n)=>{e.tagName===f&&($s(t),n(e),((e,t)=>{e.removeAttribute(t)})(e,qs),Ss(e,qs,t))},cc=(e,{from:t,to:n},r)=>{const o=(e=>{const{children:t}=e;return t?b(t):[]})(e),i=o[t],a=o[n];i&&a&&(t<n?Ts(a,i):Os(a,i),r(a),r(i))};const dc=(e,t=!1)=>async(n,r,o)=>{const{selector:i,prehidingSelector:a,content:s}=n;Zs(a);try{(({containers:e,content:t,decorateProposition:n,renderFunc:r,renderStatusHandler:o,alwaysRender:i})=>{const a=e.filter(e=>i||o.shouldRender(e)).map(async e=>{await r(e,t,n),o.markAsRendered(e)});Promise.all(a)})({containers:await N(i,ks),content:s,decorateProposition:r,renderFunc:e,renderStatusHandler:o,alwaysRender:t})}finally{ec(a)}},lc=e=>`${e}`.endsWith(\"px\")?e:`${e}px`;var uc=(e,t,n)=>{const{priority:r,...o}=t;Object.keys(o).forEach(t=>{let n=o[t];\"left\"!==t&&\"top\"!==t||(n=lc(n)),Ds(e,t,n,r)}),n(e)},gc=(e,t,n)=>{n(e)},pc=(e,t,n)=>{const{priority:r,...o}=t;Object.keys(o).forEach(t=>{let n=o[t];\"width\"!==t&&\"height\"!==t||(n=lc(n)),Ds(e,t,n,r)}),n(e)};const mc=\"setHtml\",fc=\"customCode\",hc=\"setText\",yc=\"setAttribute\",vc=\"setImageSource\",wc=\"setStyle\",Ic=\"move\",bc=\"resize\",Ec=\"rearrange\",kc=\"remove\",Cc=\"insertAfter\",Sc=\"insertBefore\",Pc=\"replaceHtml\",Dc=\"prependHtml\",Rc=\"appendHtml\",Tc=\"click\",Oc=\"collectInteractions\";var Mc=(e,t)=>{if(ws(e))return((e,t)=>t.matches?t.matches(e):t.msMatchesSelector(e))(e,t);const n=ks(e);let r=!1;for(let e=0;e<n.length;e+=1)if(n[e]===t){r=!0;break}return r};const Nc=\"view\",Ac=e=>e.map(e=>{const{trackingLabel:t,scopeType:n,...r}=e;return r}),xc=(e,t,n)=>{const{documentElement:r}=document;let o=e,i=0;for(;o&&o!==r;){if(Mc(t,o)){const e=n(t),r={metas:e},o=e.find(e=>e.trackingLabel);o&&(r.label=o.trackingLabel,r.weight=i);const a=e.find(e=>e.scopeType===Nc);return a&&(r.viewName=a.scope,r.weight=i),r}o=o.parentNode,i+=1}return{metas:null}};var qc=(e,t,n)=>{const r=[];let o,i=\"\",a=Number.MAX_SAFE_INTEGER,s=Number.MAX_SAFE_INTEGER;for(let c=0;c<t.length;c+=1){const{metas:d,label:l,weight:u,viewName:g}=xc(e,t[c],n);d&&(l&&u<=a&&(i=l,a=u),g&&u<=s&&(o=g,s=u),r.push(...Ac(d)))}return{decisionsMeta:(c=r,c.filter((e,t)=>{const n=JSON.stringify(e);return t===c.findIndex(e=>JSON.stringify(e)===n)})),propositionActionLabel:i,propositionActionToken:void 0,viewName:o};var c},$c=(e=document)=>-1!==e.location.href.indexOf(\"adobe_authoring_enabled\");var Lc=()=>{const e={};return{storeClickMeta:({selector:t,meta:{id:n,scope:r,scopeDetails:o,trackingLabel:i,scopeType:a}})=>{e[t]||(e[t]={}),e[t][n]={scope:r,scopeDetails:o,trackingLabel:i,scopeType:a}},getClickSelectors:()=>Object.keys(e),getClickMetas:t=>e[t]?(e=>Object.keys(e).map(t=>({id:t,...e[t]})))(e[t]):{}}};const _c=(e,t)=>e===Uo&&t===Oc,Uc={[Lo]:()=>!0,[_o]:()=>!0,[Uo]:_c,[Fo]:()=>!0,[$o]:()=>!0};var jc=({processPropositions:e,createProposition:t,renderedPropositions:n,viewCache:r})=>{const o=({items:e,metadataForScope:t={}})=>{const{actionType:n,selector:r}=t;return e.filter(e=>((e,t)=>\"function\"==typeof Uc[e]&&Uc[e](e,t))(e.schema,n)).map(e=>{const{schema:o}=e;return o===_o||_c(o,n)?j(t)?void 0:{...e,schema:_c(o,n)?Lo:o,data:{...e.data,selector:r,type:n}}:{...e}}).filter(e=>e)},i=e=>!(e.scope===cn&&e.renderAttempted);return({propositions:a=[],metadata:s={},viewName:c})=>{const d=l();n.concat(d.promise);const u=(({propositions:e,metadata:t})=>e.filter(i).map(e=>{if(I(e.items)){const{id:n,scope:r,scopeDetails:i}=e;return{id:n,scope:r,scopeDetails:i,items:o({items:e.items,metadataForScope:t[e.scope]})}}return e}).filter(e=>I(e.items)))({propositions:a,metadata:s}).map(e=>t(e));return Promise.resolve().then(()=>c?r.getView(c):[]).then(t=>{const{render:n,returnedPropositions:r}=e([...u,...t]);return n().then(d.resolve),{propositions:r}})}};var Bc=e=>{const{selector:t,type:n}=e;return n!==fc||\"BODY > *:eq(0)\"!==t?e:{...e,selector:\"BODY\"}};var Fc=e=>{const t={...e},{content:n,selector:r}=t;if(t.type===fc)return t;if(fr(n))return t;if(null==r)return t;const o=ks(r);return Bs(o[0],\"HEAD\")?(t.type=Rc,t.content=(e=>{const t=ys(e);return D(\"SCRIPT,LINK,STYLE\",t).map(e=>e.outerHTML).join(\"\")})(n),t):t},Vc=({preprocess:e,isPageWideSurface:t})=>(n,r=!0,o=!1,i=void 0)=>{const{id:a,scope:s,scopeDetails:c,items:d=[]}=n,{characteristics:{scopeType:l}={}}=c||{};return{getScope:()=>s,getScopeType:()=>s===cn||t(s)?\"page\":l===Nc?Nc:\"proposition\",getItems(){return d.map(t=>((t,n)=>{const{id:r,schema:o,data:i,characteristics:{trackingLabel:a}={}}=t,s=i?i.type:void 0,c=e(i);return{getId:()=>r,getSchema:()=>o,getSchemaType:()=>s,getData:()=>c,getProposition:()=>n,getTrackingLabel:()=>a,getOriginalItem:()=>t,toString:()=>JSON.stringify(t),toJSON:()=>t}})(t,this))},getNotification:()=>({id:a,scope:s,scopeDetails:c}),getId:()=>a,getIdentityMap:()=>i,toJSON:()=>n,shouldSuppressDisplay:()=>o,addToReturnValues(e,t,o,i){r&&(e.push({...n,items:o.map(e=>e.getOriginalItem()),renderAttempted:i}),i||t.push({...n,items:o.map(e=>e.getOriginalItem())}))}}},Hc=()=>({render:me,setRenderAttempted:!0,includeInNotification:!0});const zc=\"always\",Jc=\"never\",Xc=\"decoratedElementsOnly\",Gc=[zc,Jc,Xc],Qc=\"data-aep-interact-id\",Wc=\"data-aep-click-label\";let Kc=0;const Yc=(e,t,n,r,o,i,a,s)=>{const{scopeDetails:c={}}=a,{decisionProvider:d}=c;return((e,t)=>!!e&&!!e[t]&&[zc,Xc].includes(e[t]))(e,d)||t===Tc?e=>{if(!e.tagName)return;const t=(c=Ps(e,Qc))?parseInt(c,10):++Kc;var c;s(n,r,i,a,t),Ss(e,Qc,t),o&&!Ps(e,Wc)&&Ss(e,Wc,o)}:me};var Zc=(e,t)=>e!==Nc?{shouldRender:()=>!0,markAsRendered:()=>{}}:{shouldRender:e=>{if(!e)return!0;return!(e.dataset.adobePropositionIds??\"\").split(\",\").includes(t)},markAsRendered:e=>{const n=(e.dataset.adobePropositionIds??\"\").split(\",\");n.includes(t)||n.push(t),e.dataset.adobePropositionIds=n.sort().join(\",\")}},ed=({modules:e,logger:t,storeInteractionMeta:n,storeClickMeta:r,autoCollectPropositionInteractions:o})=>i=>{const{type:a,selector:s}=i.getData()||{};if(!a)return t.warn(\"Invalid DOM action data: missing type.\",i.getData()),{setRenderAttempted:!1,includeInNotification:!1};if(a===Tc)return s?(r({selector:s,meta:{...i.getProposition().getNotification(),trackingLabel:i.getTrackingLabel(),scopeType:i.getProposition().getScopeType()}}),{setRenderAttempted:!0,includeInNotification:!1}):(t.warn(\"Invalid DOM action data: missing selector.\",i.getData()),{setRenderAttempted:!1,includeInNotification:!1});if(!e[a])return t.warn(\"Invalid DOM action data: unknown type.\",i.getData()),{setRenderAttempted:!1,includeInNotification:!1};const c=Zc(i.getProposition().getScopeType(),i.getId()),d=Yc(o,a,i.getProposition().getId(),i.getId(),i.getTrackingLabel(),i.getProposition().getScopeType(),i.getProposition().getNotification(),n);return{render:()=>e[a](i.getData(),d,c),setRenderAttempted:!0,includeInNotification:!0}},td=({modules:e,logger:t,storeInteractionMeta:n,autoCollectPropositionInteractions:r})=>o=>{const{type:i,selector:a}=o.getData()||{};if(!a||!i)return{setRenderAttempted:!1,includeInNotification:!1};if(!e[i])return t.warn(\"Invalid HTML content data\",o.getData()),{setRenderAttempted:!1,includeInNotification:!1};const s=Yc(r,i,o.getProposition().getId(),o.getId(),o.getTrackingLabel(),o.getProposition().getScopeType(),o.getProposition().getNotification(),n),c=Zc(o.getProposition().getScopeType(),o.getId());return{render:()=>e[i](o.getData(),s,c),setRenderAttempted:!0,includeInNotification:!0}};const nd=\"BODY\";var rd=({logger:e,executeRedirect:t,collect:n})=>r=>{const{content:o}=r.getData()||{};if(!o)return e.warn(\"Invalid Redirect data\",r.getData()),{};return{render:()=>(Zs(nd),n({decisionsMeta:[r.getProposition().getNotification()],documentMayUnload:!0,identityMap:r.getProposition().getIdentityMap()}).then(()=>(e.logOnContentRendering({status:\"rendering-redirect\",detail:{propositionDetails:r.getProposition().getNotification(),redirect:o},message:`Redirect action ${r.toString()} executed.`,logLevel:\"info\"}),t(o))).catch(e=>{throw ec(nd),e})),setRenderAttempted:!0,onlyRenderThis:!0}},od=({schemaProcessors:e,logger:t})=>{const n=(e,n)=>()=>Promise.resolve().then(e).then(()=>(t.enabled&&t.info(`Action ${n.toString()} executed.`),n.toJSON())).catch(e=>{const{message:r,stack:o}=e,i=`Failed to execute action ${n.toString()}. ${r} ${o}`;t.logOnContentRendering({status:\"rendering-failed\",detail:{propositionDetails:n.getProposition().getNotification(),item:n.toJSON()},error:e,message:i,logLevel:\"warn\"})}),r=t=>{const n=e[t.getSchema()];return n?n(t):{}},o=({renderers:e,returnedPropositions:t,returnedDecisions:o,items:i,proposition:a})=>{let s,c,d,l,u=[...e],g=[...t],p=[...o],m=[],f=[],h=[],y=!1,v=!1,w=0;for(;i.length>w;){if(l=i[w],({render:s,setRenderAttempted:c,includeInNotification:d,onlyRenderThis:v}=r(l)),v){g=[],p=[],c?(m=[l],f=[]):(m=[],f=[l]),u=[],h=[s],y=d;break}s&&h.push(n(s,l)),d&&(y=!0),c?m.push(l):f.push(l),w+=1}if(h.length>0){const e=y?a.getNotification():void 0;u.push(()=>(async(e,t)=>{const n=(await Promise.allSettled(e.map(e=>e()))).filter(e=>\"fulfilled\"===e.status).map(e=>e.value);if(t&&I(n))return{...t,items:n}})(h,e))}else y&&u.push(()=>Promise.resolve(a.getNotification()));return m.length>0&&a.addToReturnValues(g,p,m,!0),f.length>0&&a.addToReturnValues(g,p,f,!1),{renderers:u,returnedPropositions:g,returnedDecisions:p,onlyRenderThis:v}};return(e,n=[])=>{let r,i,a,s=[],c=[],d=[],l=0;for(;e.length>l&&(i=e[l],a=i.getItems(),({renderers:s,returnedPropositions:c,returnedDecisions:d,onlyRenderThis:r}=o({renderers:s,returnedPropositions:c,returnedDecisions:d,items:a,proposition:i})),!r);)l+=1;r&&e.forEach((e,t)=>{t!==l&&e.addToReturnValues(c,d,e.getItems(),!1)}),n.forEach(e=>{e.addToReturnValues(c,d,e.getItems(),!1)});return{returnedPropositions:c,returnedDecisions:d,render:()=>Promise.all(s.map(e=>e())).then(e=>{const n=e.filter(e=>e),r=n.map(e=>{const{id:t,scope:n,scopeDetails:r}=e;return{id:t,scope:n,scopeDetails:r}});if(I(n)){const e=Q(n,e=>e.scope);t.logOnContentRendering({status:\"rendering-succeeded\",detail:{...e},message:`Scopes: ${JSON.stringify(e)} successfully executed.`,logLevel:\"info\"})}return r})}}};var id=({processPropositions:e,createProposition:t,notificationHandler:n})=>({renderDecisions:r,propositions:o,event:i,personalization:a={},identityMap:s})=>{if(!r)return Promise.resolve();const{sendDisplayEvent:c=!0}=a,d=i?i.getViewName():void 0,l=(()=>{let e=0;return t=>{const{items:n=[]}=t;return!!n.some(e=>e.schema===Fo)&&(e+=1,e>1)}})(),u=o.map(e=>t(e,!0,l(e),s)),{render:g,returnedPropositions:p}=e(u),m=n(r,c,d,s),f=u.reduce((e,t)=>(e[t.getId()]=t,e),{});return g().then(e=>{const t=e.filter(e=>!f[e.id].shouldSuppressDisplay()),n=e.filter(e=>f[e.id].shouldSuppressDisplay());m(t,n)}),Promise.resolve({propositions:p})};const ad=\"defaultContent\",sd=[\"content\",\"contentType\"],cd=[\"mobileParameters\",\"webParameters\",\"html\"];var dd=({modules:e,logger:t})=>n=>{const r=n.getData(),o=n.getProposition(),i={...o.getNotification()},a=o.shouldSuppressDisplay();if(!r)return t.warn(\"Invalid in-app message data: undefined.\",r),{};const{type:s=ad}=r;return e[s]?((e,t)=>{for(let n=0;n<sd.length;n+=1){const r=sd[n];if(!Object.prototype.hasOwnProperty.call(e,r))return t.warn(`Invalid in-app message data: missing property '${r}'.`,e),!1}const{content:n,contentType:r}=e;if(\"application/json\"===r)for(let r=0;r<cd.length;r+=1){const o=cd[r];if(!Object.prototype.hasOwnProperty.call(n,o))return t.warn(`Invalid in-app message data.content: missing property '${o}'.`,e),!1}return!0})(r,t)?i?{render:()=>a?null:e[s]({...r,meta:i,identityMap:o.getIdentityMap()}),setRenderAttempted:!0,includeInNotification:!0}:(t.warn(\"Invalid in-app message meta: undefined.\",i),{}):{}:(t.warn(\"Invalid in-app message data: unknown type.\",r),{})};const ld=e=>{const t=D(`#${e}`,document);t&&t.length>0&&$(t[0])};var ud=e=>(t,n=!1)=>(n?e.location.href=t:e.location.replace(t),new Promise(()=>{}));const gd=\"alloy-messaging-container\",pd=\"alloy-overlay-container\",md=\"alloy-content-iframe\",fd=()=>[gd,pd].forEach(ld),hd=(e,t=ud(window))=>n=>{n.preventDefault(),n.stopImmediatePropagation();const{target:r}=n,o=\"a\"===r.tagName.toLowerCase()?r:r.closest(\"a\");if(!o)return;const{action:i,interaction:a,link:s,label:c,uuid:d}=(e=>{const t={};if(!e||\"a\"!==e.tagName.toLowerCase())return t;const{href:n}=e;if(!n||!n.startsWith(\"adbinapp://\"))return t;const r=n.split(\"?\"),o=r[0].split(\"://\")[1],i=e.innerText,a=e.getAttribute(\"data-uuid\")||\"\";let s,c;if(I(r)){const e=be.parse(r[1]);s=e.interaction||\"\",c=qn(e.link||\"\")}return{action:o,interaction:s,link:c,label:i,uuid:a}})(o);e(i,{label:c,id:a,uuid:d,link:s}),\"dismiss\"===i&&fd(),pe(s)&&s.length>0&&t(s,!0)},yd=e=>{const{verticalAlign:t,width:n,horizontalAlign:r,backdropColor:o,height:i,cornerRadius:a,horizontalInset:s,verticalInset:c,uiTakeover:d=!1}=e,l={width:n?`${n}%`:\"100%\",backgroundColor:o||\"rgba(0, 0, 0, 0.5)\",borderRadius:a?`${a}px`:\"0px\",border:\"none\",position:d?\"fixed\":\"relative\",overflow:\"hidden\"};return\"left\"===r?l.left=s?`${s}%`:\"0\":\"right\"===r?l.right=s?`${s}%`:\"0\":\"center\"===r&&(l.left=\"50%\",l.transform=\"translateX(-50%)\"),\"top\"===t?l.top=c?`${c}%`:\"0\":\"bottom\"===t?(l.position=\"fixed\",l.bottom=c?`${c}%`:\"0\"):\"center\"===t&&(l.top=\"50%\",l.transform=(\"center\"===r?`${l.transform} `:\"\")+\"translateY(-50%)\",l.display=\"flex\",l.alignItems=\"center\",l.justifyContent=\"center\"),l.height=i?`${i}vh`:\"100%\",l},vd=e=>{const{backdropOpacity:t,backdropColor:n}=e;return{position:\"fixed\",top:\"0\",left:\"0\",width:\"100%\",height:\"100%\",background:\"transparent\",opacity:t||.5,backgroundColor:n||\"#FFFFFF\"}},wd=[\"enabled\",\"parentElement\",\"insertionMethod\"],Id=(e={},t)=>{fd();const{content:n,contentType:r,mobileParameters:o}=e;let{webParameters:i}=e;if(r!==pi)return;const a=p(\"div\",{id:gd}),s=((e,t)=>{const n=(new DOMParser).parseFromString(e,pi),r=n.querySelector(\"script\");r&&r.setAttribute(\"nonce\",xs());const o=p(\"iframe\",{src:URL.createObjectURL(new Blob([n.documentElement.outerHTML],{type:\"text/html\"})),id:md});return o.addEventListener(\"load\",()=>{const{addEventListener:e}=o.contentDocument||o.contentWindow.document;e(\"click\",t)}),o})(n,hd(t)),c=p(\"div\",{id:pd});(e=>{if(!e)return!1;const t=Object.keys(e);if(!t.includes(gd))return!1;if(!t.includes(pd))return!1;const n=Object.values(e);for(let e=0;e<n.length;e+=1){if(!Ct(n[e],\"style\"))return!1;if(!Ct(n[e],\"params\"))return!1;for(let t=0;t<wd.length;t+=1)if(!Ct(n[e].params,wd[t]))return!1}return!0})(i)||(i=(e=>{if(!e)return;const{uiTakeover:t=!1}=e;return{[md]:{style:{border:\"none\",width:\"100%\",height:\"100%\"},params:{enabled:!0,parentElement:\"#alloy-messaging-container\",insertionMethod:\"appendChild\"}},[gd]:{style:yd(e),params:{enabled:!0,parentElement:\"body\",insertionMethod:\"appendChild\"}},[pd]:{style:vd(e),params:{enabled:!0===t,parentElement:\"body\",insertionMethod:\"appendChild\"}}}})(o)),i&&((e,t,n,r)=>{[{id:pd,element:r},{id:gd,element:n},{id:md,element:e}].forEach(({id:e,element:n})=>{const{style:r={},params:o={}}=t[e];Object.assign(n.style,r);const{parentElement:i=\"body\",insertionMethod:a=\"appendChild\",enabled:s=!0}=o,c=document.querySelector(i);s&&c&&\"function\"==typeof c[a]&&c[a](n)})})(s,i,a,c)};var bd=e=>({defaultContent:t=>((e,t)=>new Promise(n=>{const{meta:r,identityMap:o}=e;Id(e,(e,n)=>{const i={};i[Go.INTERACT]=1,-1!==Object.values(Go).indexOf(e)&&(i[e]=1),t({decisionsMeta:[r],propositionAction:n,eventType:Ho,propositionEventTypes:Object.keys(i),identityMap:o})}),n({meta:r})}))(t,e)});const Ed=e=>{const t=e.find(e=>e.scopeType===Nc);return t?t.scope:void 0};var kd=(e,t,n)=>{const{interactIds:r,clickLabel:o=\"\",clickToken:i}=(e=>{const{documentElement:t}=document;let n=e;const r=new Set;let o,i;for(;n&&n!==t&&!(n instanceof ShadowRoot);){const e=Ps(n,Qc);e&&r.add(e),o=o||Ps(n,Wc),i=i||Ps(n,\"data-aep-click-token\"),n=n.parentNode}return{interactIds:[...r],clickLabel:o,clickToken:i}})(e),a=((e,t,n)=>r=>{const{scopeDetails:o={}}=r,{decisionProvider:i}=o;return e[i]===zc||e[i]===Xc&&(t||n)})(n,o,i);if(0===r.length)return{};const s=t(r).filter(a);return{decisionsMeta:Ac(s),propositionActionLabel:o,propositionActionToken:i,viewName:Ed(s)}};const Cd=({config:e,logger:t,eventManager:n,consent:r})=>{const{targetMigrationEnabled:o,prehidingStyle:i,autoCollectPropositionInteractions:a}=e,s=Ei({eventManager:n,mergeDecisionsMeta:ki}),c=(e=>()=>{const t=Cs(Ks);t&&(e.logOnContentHiding({status:\"show-containers\",message:\"Prehiding style removed to show containers.\",logLevel:\"info\"}),$(t))})(t),d=(e=>t=>{if(!t)return;if(Cs(Ks))return;const n=xs(),r={id:Ks,...n&&{nonce:n}},o=p(h,r,{textContent:t});e.logOnContentHiding({status:\"hide-containers\",message:\"Prehiding style applied to hide containers.\",logLevel:\"info\"}),g(document.head,o)})(t),{storeInteractionMeta:u,getInteractionMetas:m}=(()=>{const e={},t={};return{storeInteractionMeta:(n,r,o,i,a)=>{a=parseInt(a,10),e[a]||(e[a]={},t[a]={}),t[a][n]||(t[a][n]=new Set),t[a][n].add(r),e[a][n]={...i,scopeType:o}},getInteractionMetas:n=>Array.isArray(n)&&0!==n.length?Object.values(n.map(e=>parseInt(e,10)).reduce((n,r)=>(Object.keys(e[r]||{}).forEach(o=>{n[o]||(n[o]={proposition:e[r][o],items:new Set}),n[o].items=new Set([...n[o].items,...t[r][o]])}),n),{})).map(({proposition:e,items:t})=>({...e,items:Array.from(t).map(e=>({id:e}))})):[]}})(),{storeClickMeta:f,getClickSelectors:y,getClickMetas:v}=Lc(),w=(({window:e})=>()=>e.location)({window:window}),b={[mc]:dc(Qs,!0),[fc]:dc(Ws,!0),[hc]:dc(tc,!0),[yc]:dc(ac,!0),[vc]:dc(sc,!0),[wc]:dc(ic,!0),[Ic]:dc(uc,!0),[bc]:dc(pc,!0),[Ec]:dc(cc),[kc]:dc($,!0),[Cc]:dc(oc),[Sc]:dc(nc),[Pc]:dc(rc,!0),[Dc]:dc(Ws),[Rc]:dc(Gs),[Oc]:dc(gc,!0)},E=(k=[Fc,Bc],e=>e?k.reduce((e,t)=>({...e,...t(e)}),e):e);var k;const C=Vc({preprocess:E,isPageWideSurface:Bi}),S=(({createProposition:e})=>{let t=!1,n=Promise.resolve({});const r=(t,n)=>{const r=t[n.toLowerCase()];return r&&r.length>0?r:[e({scope:n,scopeDetails:{characteristics:{scopeType:Nc}},items:[{schema:$o}]},!1)]};return{createCacheUpdate:e=>{const o=l();return t=!0,n=n.then(e=>o.promise.then(t=>({...e,...t})).catch(()=>e)),{update(t){const n=t.filter(e=>e.getScope()),i=Q(n,e=>e.getScope().toLowerCase());return o.resolve(i),e?r(i,e):[]},cancel(){o.reject()}}},getView:e=>n.then(t=>r(t,e)),isInitialized:()=>t}})({createProposition:C}),P=ud(window),D={[$o]:Hc,[Lo]:ed({modules:b,logger:t,storeInteractionMeta:u,storeClickMeta:f,autoCollectPropositionInteractions:a}),[_o]:td({modules:b,logger:t,storeInteractionMeta:u,autoCollectPropositionInteractions:a}),[Bo]:rd({logger:t,executeRedirect:P,collect:s}),[Fo]:dd({modules:bd(s),logger:t})},R=od({schemaProcessors:D,logger:t}),T=(()=>{let e=Promise.resolve([]);return{concat(t){e=e.then(e=>t.then(t=>e.concat(t)).catch(()=>e))},clear(){const t=e;return e=Promise.resolve([]),t}}})(),O=((e,t)=>(n,r,o,i)=>{if(!n)return()=>{};if(!r){const e=l();return t.concat(e.promise),e.resolve}return(t=[],n=[])=>{I(t)&&e({decisionsMeta:t,viewName:o,identityMap:i}),I(n)&&e({decisionsMeta:n,eventType:Xo,propositionAction:{reason:\"Conflict\"},viewName:o,identityMap:i})}})(s,T),M=(({logger:e,prehidingStyle:t,showContainers:n,hideContainers:r,mergeQuery:o,processPropositions:i,createProposition:a,notificationHandler:s,consent:c})=>({cacheUpdate:d,personalizationDetails:l,event:u,onResponse:g,identityMap:p})=>{const{state:m,wasSet:f}=c.current();\"out\"===m&&f||(l.isRenderDecisions()?r(t):n()),o(u,l.createQueryDetails());const h=s(l.isRenderDecisions(),l.isSendDisplayEvent(),l.getViewName(),p);g(({response:t})=>{const r=t.getPayloadsByType(\"personalization:decisions\");I(r)||e.logOnContentRendering({status:\"no-offers\",message:\"No offers were returned.\",logLevel:\"info\",detail:{query:l.createQueryDetails()}});const o=r.map(e=>a(e,!0,!1,p)),{page:s=[],view:c=[],proposition:u=[]}=Q(o,e=>e.getScopeType()),g=d.update(c);let m,f,y;return l.isRenderDecisions()?(({render:m,returnedPropositions:f,returnedDecisions:y}=i([...s,...g],u)),I(s)&&e.logOnContentRendering({status:\"rendering-started\",message:\"Started rendering propositions for page-wide scope.\",logLevel:\"info\",detail:{scope:cn,propositions:s.map(e=>e.toJSON())}}),I(g)&&e.logOnContentRendering({status:\"rendering-started\",message:`Rendering propositions started for view scope - ${l.getViewName()}.`,logLevel:\"info\",detail:{scope:l.getViewName(),propositions:g.map(e=>e.toJSON())}}),m().then(h),1===s.length&&s[0].getItems().every(e=>e.getSchema()===Bo)||n()):({returnedPropositions:f,returnedDecisions:y}=i([],[...s,...g,...u])),{propositions:f,decisions:y}})})({prehidingStyle:i,showContainers:c,hideContainers:d,mergeQuery:Ci,processPropositions:R,createProposition:C,notificationHandler:O,consent:r,logger:t}),N=(({mergeDecisionsMeta:e,collectInteractions:t,collectClicks:n,getInteractionMetas:r,getClickMetas:o,getClickSelectors:i,autoCollectPropositionInteractions:a})=>({event:s,clickedElement:c})=>{const d=[];let l,u,g;if([t(c,r,a),n(c,i(),o)].forEach(({decisionsMeta:e,propositionActionLabel:t,propositionActionToken:n,viewName:r})=>{Array.prototype.push.apply(d,e),!l&&t&&(l=t),!u&&n&&(u=n),!g&&r&&(g=r)}),I(d)){const t={eventType:Ho};g&&(t.web={webPageDetails:{viewName:g}}),s.mergeXdm(t),e(s,d,[Go.INTERACT],((e,t)=>{if(!t&&!e)return;const n={};return e&&(n.label=e),t&&(n.tokens=[t]),n})(l,u))}})({mergeDecisionsMeta:ki,collectInteractions:kd,collectClicks:qc,getInteractionMetas:m,getClickMetas:v,getClickSelectors:y,autoCollectPropositionInteractions:a}),A=(({processPropositions:e,viewCache:t,logger:n})=>({personalizationDetails:r,onResponse:o})=>{let i,a;const s=r.getViewName();return o(()=>({propositions:i,decisions:a})),t.getView(s).then(t=>{let o;return r.isRenderDecisions()?(({render:o,returnedPropositions:i,returnedDecisions:a}=e(t)),n.logOnContentRendering({status:\"rendering-started\",message:`Started rendering propositions for view scope - ${s}.`,logLevel:\"info\",detail:{scope:s,propositions:t.map(e=>e.toJSON())}}),o()):(({returnedPropositions:i,returnedDecisions:a}=e([],t)),[])})})({processPropositions:R,viewCache:S,logger:t}),x=jc({processPropositions:R,createProposition:C,renderedPropositions:T,viewCache:S}),q=(({targetMigrationEnabled:e})=>e?e=>{e.getPayload().mergeMeta({target:{migration:!0}})}:me)({targetMigrationEnabled:o}),L=id({processPropositions:R,createProposition:C,notificationHandler:O}),_=(({showContainers:e,consent:t})=>()=>{const{state:n,wasSet:r}=t.current();n===_t&&r?e():t.awaitConsent().catch(e)})({showContainers:c,consent:r});return hs({getPageLocation:w,logger:t,fetchDataHandler:M,viewChangeHandler:A,onClickHandler:N,isAuthoringModeEnabled:$c,mergeQuery:Ci,viewCache:S,showContainers:c,applyPropositions:x,setTargetMigration:q,mergeDecisionsMeta:ki,renderedPropositions:T,onDecisionHandler:L,handleConsentFlicker:_})};Cd.namespace=\"Personalization\";const Sd=Gc.map(e=>bt(e));Cd.configValidators=Ct({prehidingStyle:St().nonEmpty(),targetMigrationEnabled:wt().default(!1),autoCollectPropositionInteractions:Ct({[_r]:ht(Sd).default(zc),[Ur]:ht(Sd).default(Jc)}).default({[_r]:zc,[Ur]:Jc}).noUnknownFields()});const Pd=async({vapidPublicKey:e,window:t})=>{if(!(\"serviceWorker\"in t.navigator))throw new Error(\"Service workers are not supported in this browser.\");if(!(\"PushManager\"in t)||!(\"Notification\"in t))throw new Error(\"Push notifications are not supported in this browser.\");if(\"granted\"!==t.Notification.permission)throw new Error(\"The user has not given permission to send push notifications.\");const o=await t.navigator.serviceWorker.getRegistration();if(!o)throw new Error(\"No service worker registration was found.\");if(!e)throw new Error(\"No VAPID public key was provided.\");const i={userVisibleOnly:!0,applicationServerKey:n(e)};try{const e=await o.pushManager.subscribe(i),t=e.getKey(\"p256dh\"),n=e.getKey(\"auth\");return{endpoint:e.endpoint,keys:{p256dh:t?r(new Uint8Array(t),{urlSafe:!0}):null,auth:n?r(new Uint8Array(n),{urlSafe:!0}):null}}}catch(n){const r=await o.pushManager.getSubscription();if(!r)throw n;if(!await r.unsubscribe())throw n;return Pd({vapidPublicKey:e,window:t})}};const Dd=\"config\",Rd=\"alloyConfig\";async function Td(e,t){try{const i=await(n=\"alloyPushNotifications\",r=1,o=e=>{e.objectStoreNames.contains(Dd)||e.createObjectStore(Dd,{keyPath:\"id\"})},new Promise((e,t)=>{const i=indexedDB.open(n,r);i.onerror=()=>t(i.error),i.onsuccess=()=>e(i.result),i.onupgradeneeded=e=>{const t=e.target.result;o&&o(t)}})),a=await((e,t,n)=>new Promise((r,o)=>{const i=e.transaction([t],\"readonly\").objectStore(t).get(n);i.onerror=()=>o(i.error),i.onsuccess=()=>r(i.result)}))(i,Dd,Rd),s={...a||{},...e,id:Rd,timestamp:Date.now()};return await((e,t,n)=>new Promise((r,o)=>{const i=e.transaction([t],\"readwrite\").objectStore(t).put(n);i.onerror=()=>o(i.error),i.onsuccess=()=>r(i.result)}))(i,Dd,s),i.close(),t.info(\"Successfully saved web SDK config to IndexedDB\",s),!0}catch(e){return t.error(\"Failed to save config to IndexedDB\",{error:e}),!1}var n,r,o}const Od=\"subscriptionDetails\";var Md=async({config:{vapidPublicKey:e,appId:t},storage:n,logger:r,sendEdgeNetworkRequest:o,consent:i,eventManager:a,identity:s,window:c,getPushSubscriptionDetails:d=Pd})=>{await s.awaitIdentity();const l=s.getEcidFromCookie();if(!l)return void r.info(\"No ECID is available. Not sending push subscription details to the server.\");const u=await d({vapidPublicKey:e,window:c}),g=JSON.stringify(ke(u)),p=`${l}${g}`,m=await n.getItem(Od);if(m&&p===m)return void r.info(\"Subscription details have not changed. Not sending to the server.\");const f=await(async({ecid:e,eventManager:t,serializedPushSubscriptionDetails:n,appId:r})=>{const o=t.createEvent();o.setUserData({pushNotificationDetails:[{appID:r,token:n,platform:\"web\",denylisted:!1,identity:{namespace:{code:\"ECID\"},id:e}}]}),o.finalize();const i=mn();return i.addEvent(o),i})({eventManager:a,ecid:l,serializedPushSubscriptionDetails:g,appId:t}),h=(({payload:e})=>ln({payload:e,getAction:()=>\"interact\",getUseSendBeacon:()=>!1}))({payload:f});await i.awaitConsent(),await o({request:h});await Td({ecid:l},r)&&n.setItem(Od,p)};const Nd=({orgId:e,pushNotifications:{vapidPublicKey:t,appId:n,trackingDatasetId:r}={vapidPublicKey:void 0,appId:void 0,trackingDatasetId:void 0}})=>Boolean(e&&t&&n&&r),Ad=({eventManager:e,config:t,logger:n,consent:r,identity:o,getBrowser:i,sendEdgeNetworkRequest:a,platformServices:s})=>({lifecycle:{async onComponentsRegistered(){if(Nd(t)){const{datastreamId:e,edgeDomain:r,edgeBasePath:o,pushNotifications:{trackingDatasetId:a}}=t;await Td({datastreamId:e,edgeDomain:r,edgeBasePath:o,datasetId:a,browser:i()},n)}}},commands:{sendPushSubscription:{run:async()=>{if(!Nd(t))throw new Error(\"Push notifications module is not configured.\");const{orgId:i,pushNotifications:{vapidPublicKey:c,appId:d}}=t,l=s.storage.createNamespacedStorage(`${X(i)}.pushNotifications.`);return Md({config:{vapidPublicKey:c,appId:d},storage:l.persistent,logger:n,sendEdgeNetworkRequest:a,consent:r,eventManager:e,identity:o,window:window})},optionsValidator:Ct({}).noUnknownFields()}}});Ad.namespace=\"Push Notifications\",Ad.configValidators=Ct({pushNotifications:Ct({vapidPublicKey:St().required(),appId:St().required(),trackingDatasetId:St().required()}).noUnknownFields()});var xd=Object.freeze({__proto__:null,activityCollector:ya,advertising:gs,audiences:Kn,brandConcierge:Ji,consent:ir,eventMerge:sr,mediaAnalyticsBridge:Lr,personalization:Cd,pushNotifications:Ad,rulesEngine:Si,streamingMedia:Ri});var qd=[[\"architecture\",\"string\"],[\"bitness\",\"string\"],[\"model\",\"string\"],[\"platformVersion\",\"string\"],[\"wow64\",\"boolean\"]];const $d=new Set([\"decisioning.propositionFetch\",\"decisioning.propositionDisplay\",\"decisioning.propositionInteract\"]);const Ld=(e=>t=>{t.mergeXdm({web:{webPageDetails:{URL:e.location.href||e.location},webReferrer:{URL:e.document.referrer}}})})(window),_d=(e=>t=>{const{screen:{width:n,height:r}}=e,o={},i=De(r);i>=0&&(o.screenHeight=i);const a=De(n);a>=0&&(o.screenWidth=a);const s=(e=>{const{screen:{orientation:t}}=e;if(null==t||null==t.type)return null;const n=t.type.split(\"-\");return 0===n.length||\"portrait\"!==n[0]&&\"landscape\"!==n[0]?null:n[0]})(e)||(e=>{if(w(e.matchMedia)){if(e.matchMedia(\"(orientation: portrait)\").matches)return\"portrait\";if(e.matchMedia(\"(orientation: landscape)\").matches)return\"landscape\"}return null})(e);s&&(o.screenOrientation=s),Object.keys(o).length>0&&t.mergeXdm({device:o})})(window),Ud=(e=>t=>{const{document:{documentElement:{clientWidth:n,clientHeight:r}={}}}=e,o={type:\"browser\"},i=De(n);i>=0&&(o.browserDetails={viewportWidth:i});const a=De(r);a>=0&&(o.browserDetails=o.browserDetails||{},o.browserDetails.viewportHeight=a),t.mergeXdm({environment:o})})(window),jd=(Bd=()=>new Date,e=>{const t=Bd(),n={},r=De(t.getTimezoneOffset());void 0!==r&&(n.localTimezoneOffset=r),(void 0===r||Math.abs(r)<6e3)&&(n.localTime=(e=>{const t=e.getFullYear(),n=Re(e.getMonth()+1,2,\"0\"),r=Re(e.getDate(),2,\"0\"),o=Re(e.getHours(),2,\"0\"),i=Re(e.getMinutes(),2,\"0\"),a=Re(e.getSeconds(),2,\"0\"),s=Re(e.getMilliseconds(),3,\"0\"),c=De(e.getTimezoneOffset(),0);return`${t}-${n}-${r}T${o}:${i}:${a}.${s}${c>0?\"-\":\"+\"}${Re(Math.floor(Math.abs(c)/60),2,\"0\")}:${Re(Math.abs(c)%60,2,\"0\")}`})(t));const o=Intl.DateTimeFormat().resolvedOptions().timeZone;o&&(n.ianaTimezone=o),e.mergeXdm({placeContext:n})});var Bd;const Fd=$r(()=>new Date),Vd={web:Ld,device:_d,environment:Ud,placeContext:jd},Hd={highEntropyUserAgentHints:(e=>(e=>\"userAgentData\"in e)(e)?(t,n)=>{try{return e.userAgentData.getHighEntropyValues(qd.map(e=>e[0])).then(e=>{const n={};qd.forEach(([t,r])=>{Object.prototype.hasOwnProperty.call(e,t)&&typeof e[t]===r&&(n[t]=e[t])}),t.mergeXdm({environment:{browserDetails:{userAgentClientHints:n}}})})}catch(e){return n.warn(`Unable to collect user-agent client hints. ${e.message}`),me}}:me)(navigator),oneTimeAnalyticsReferrer:(e=>{let t=null;return n=>{const r=n.getContent(),o=r.xdm?.eventType;if($d.has(o))return;const i=r.data?.__adobe?.analytics?.referrer,a=void 0!==i?i:e.document.referrer;a!==t?(n.mergeData({__adobe:{analytics:{referrer:a}}}),t=a):n.mergeData({__adobe:{analytics:{referrer:\"\"}}})}})(window)},zd={...Vd,...Hd},Jd=[Fd,e=>{e.mergeXdm({implementationDetails:{name:\"https://ns.adobe.com/experience/alloy\",version:Vn,environment:\"browser\"}})}],Xd=({config:e,logger:t})=>((e,t,n,r)=>{const o=e.context.flatMap((e,r)=>n[e]?[n[e]]:(t.warn(`Invalid context[${r}]: '${e}' is not available.`),[])).concat(r);return{namespace:\"Context\",lifecycle:{onBeforeEvent:({event:e})=>Promise.all(o.map(n=>Promise.resolve(n(e,t))))}}})(e,t,zd,Jd);Xd.namespace=\"Context\",Xd.configValidators=Ct({context:vt(St()).default(Object.keys(Vd))});var Gd=Object.freeze({__proto__:null,context:Xd});const Qd=({logger:e})=>{const{fetch:t,navigator:n}=window,r=(({fetch:e})=>(t,n)=>e(t,{method:\"POST\",cache:\"no-cache\",credentials:\"include\",headers:{\"Content-Type\":\"text/plain; charset=UTF-8\"},referrerPolicy:\"no-referrer-when-downgrade\",body:n}).then(e=>e.text().then(t=>({statusCode:e.status,getHeader:t=>e.headers.get(t),body:t}))))({fetch:t}),o=\"function\"==typeof n.sendBeacon?(({sendBeacon:e,sendFetchRequest:t,logger:n})=>(r,o)=>{const i=new Blob([o],{type:\"text/plain; charset=UTF-8\"});return e(r,i)?Promise.resolve({statusCode:204,getHeader:()=>null,body:\"\"}):(n.info(\"Unable to use `sendBeacon`; falling back to `fetch`.\"),t(r,o))})({sendBeacon:n.sendBeacon.bind(n),sendFetchRequest:r,logger:e}):r;return{sendFetchRequest:r,sendBeaconRequest:o}},Wd=(e,t)=>({getItem(n){try{return Promise.resolve(window[e].getItem(t+n))}catch{return Promise.resolve(null)}},setItem(n,r){try{return window[e].setItem(t+n,r),Promise.resolve(!0)}catch{return Promise.resolve(!1)}},removeItem(n){try{return window[e].removeItem(t+n),Promise.resolve(!0)}catch{return Promise.resolve(!1)}},clear(){try{return Object.keys(window[e]).forEach(n=>{n.startsWith(t)&&window[e].removeItem(n)}),Promise.resolve(!0)}catch{return Promise.resolve(!1)}}});\n/*! js-cookie v3.0.7 | MIT */\nfunction Kd(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)\"__proto__\"!==r&&(e[r]=n[r])}return e}var Yd=function e(t,n){function r(e,r,o){if(\"undefined\"!=typeof document){\"number\"==typeof(o=Kd({},n,o)).expires&&(o.expires=new Date(Date.now()+864e5*o.expires)),o.expires&&(o.expires=o.expires.toUTCString()),e=encodeURIComponent(e).replace(/%(2[346B]|5E|60|7C)/g,decodeURIComponent).replace(/[()]/g,escape);var i=\"\";for(var a in o)o[a]&&(i+=\"; \"+a,!0!==o[a]&&(i+=\"=\"+o[a].split(\";\")[0]));return document.cookie=e+\"=\"+t.write(r,e)+i}}return Object.create({set:r,get:function(e){if(\"undefined\"!=typeof document&&(!arguments.length||e)){for(var n=document.cookie?document.cookie.split(\"; \"):[],r={},o=0;o<n.length;o++){var i=n[o].split(\"=\"),a=i.slice(1).join(\"=\");try{var s=decodeURIComponent(i[0]);if(s in r||(r[s]=t.read(a,s)),e===s)break}catch{}}return e?r[e]:r}},remove:function(e,t){r(e,\"\",Kd({},t,{expires:-1}))},withAttributes:function(t){return e(this.converter,Kd({},this.attributes,t))},withConverter:function(t){return e(Kd({},this.converter,t),this.attributes)}},{attributes:{value:Object.freeze(n)},converter:{value:Object.freeze(t)}})}({read:function(e){return'\"'===e[0]&&(e=e.slice(1,-1)),e.replace(/(%[\\dA-F]{2})+/gi,decodeURIComponent)},write:function(e){return encodeURIComponent(e).replace(/%(2[346BF]|3[AC-F]|40|5[BDE]|60|7[BCD])/g,decodeURIComponent)}},{path:\"/\"});const Zd=(e=Yd)=>({get:t=>e.get(t),getAll:()=>e.get(),set:(t,n,r)=>e.set(t,n,r),remove:(t,n)=>{e.remove(t,n)},withConverter:t=>Zd(e.withConverter(t))}),el=({logger:e})=>new Promise((n,r)=>{if(t(window.adobe)&&t(window.adobe.optIn)){const t=window.adobe.optIn;e.info(\"Delaying request while waiting for legacy opt-in to let Visitor retrieve ECID from server.\"),t.fetchPermissions(()=>{t.isApproved([t.Categories.ECID])?(e.info(\"Received legacy opt-in approval to let Visitor retrieve ECID from server.\"),n()):r(new Error(\"Legacy opt-in was declined.\"))},!0)}else n()}),tl=async({orgId:e,logger:t})=>{const n=(()=>{const{Visitor:e}=window;return w(e)&&w(e.getInstance)&&e})();if(n)try{return await el({logger:t}),t.info(\"Delaying request while using Visitor to retrieve ECID from server.\"),await new Promise(r=>{n.getInstance(e,{}).getMarketingCloudVisitorID(e=>{t.info(\"Resuming previously delayed request that was waiting for ECID from Visitor.\"),r(e)},!0)})}catch(e){return void(e?t.info(`${e.message}, retrieving ECID from experience edge`):t.info(\"An error occurred while obtaining the ECID from Visitor.\"))}},nl=()=>({createNetworkService:e=>Qd({logger:e}),storage:{createNamespacedStorage(e){const t=V+e;return{session:Wd(\"sessionStorage\",t),persistent:Wd(\"localStorage\",t)}}},cookie:Zd(),runtime:{setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window),atob:window.atob.bind(window),btoa:window.btoa.bind(window),TextEncoder:window.TextEncoder,TextDecoder:window.TextDecoder,now:()=>Date.now()},legacy:{getEcidFromVisitor:tl,awaitVisitorOptIn:el},globals:{getInstanceNames:()=>window.__alloyNS||[],getInstanceQueue:e=>{const t=window[e];return t&&t.q||[]},getMonitors:()=>window.__alloyMonitors||[],getLocationSearch:()=>window.location.search,getLocationHash:()=>window.location.hash,getUserAgent:()=>window.navigator.userAgent,getHostname:()=>window.location.hostname,getPageLocation:()=>window.location,isPageSsl:()=>\"https:\"===window.location.protocol,fireReferrerHideableImage:U(),getWindowContext:()=>({title:document.title,url:window.location.href,referrer:document.referrer,height:window.innerHeight,width:window.innerWidth,scrollY:window.scrollY,scrollX:window.scrollX})}}),rl=({components:e=[],monitors:t=[],...n}={})=>((e={},t)=>{const n=Ct({name:St().default(\"alloy\"),monitors:vt(Ct({})).default([]),components:vt(It())}).noUnknownFields(),{name:r,monitors:o,components:i}=n(e);return Gn({instanceName:r,monitors:o,components:i,createPlatformServices:t})})({...n,monitors:t,components:[...Object.values(Gd),...e]},nl);(({components:e})=>{const t=window.__alloyNS;if(t)for(const n of t){const t=rl({name:n,components:e}),r=e=>{const[n,r,[o,i]]=e;return t(o,i).then(n,r)},o=window[n].q;o.push=r,o.forEach(r)}})({components:Object.values(xd)})}();\n";

/**
 * Lazily loads the vendored Adobe Web SDK (base-code stub + standalone bundle).
 * Prefers the build-inlined copy (self-contained, always present); falls back to
 * fetching the sibling alloy-*.min.js files when the inline is empty (unbuilt
 * checkout). Idempotent — safe to call from every widget render.
 */
export function _loadAlloyScripts ({
  baseInline = ALLOY_BASE_INLINE,
  standaloneInline = ALLOY_STANDALONE_INLINE
} = {}) {
  if (_isAlloyReady()) {
    return Promise.resolve();
  }
  if (_alloyLoadPromise) return _alloyLoadPromise;

  const loadExternalScript = (filename) => new Promise((resolve, reject) => {
    const urls = [
      new URL(`./${filename}`, import.meta.url),
      new URL(`../dist/${filename}`, import.meta.url)
    ];
    const load = (index) => {
      const script = document.createElement('script');
      script.src = urls[index].href;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        if (index + 1 < urls.length) {
          load(index + 1);
          return;
        }
        reject(new Error(`${LOG_PREFIX} failed to load ${filename}`));
      };
      document.head.appendChild(script);
    };
    load(0);
  });

  const loadExternalAlloy = () => {
    const baseReady = typeof window !== 'undefined' && typeof window.alloy === 'function';
    const loadBase = baseReady ? Promise.resolve() : loadExternalScript('alloy-base.min.js');
    return loadBase
      .then(() => loadExternalScript('alloy-standalone.min.js'))
      .then(() => {
        if (!_isAlloyReady()) {
          throw new Error(`${LOG_PREFIX} Alloy failed to initialize`);
        }
      });
  };

  let loadPromise;
  if (baseInline && standaloneInline) {
    loadPromise = Promise.resolve().then(() => {
      try {
        const base = document.createElement('script');
        base.textContent = baseInline;
        document.head.appendChild(base);
        const standalone = document.createElement('script');
        standalone.textContent = standaloneInline;
        document.head.appendChild(standalone);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`${LOG_PREFIX} inline Alloy load failed; trying external assets:`, err);
      }
      return _isAlloyReady() ? undefined : loadExternalAlloy();
    });
  } else {
    loadPromise = loadExternalAlloy();
  }

  const trackedPromise = loadPromise.finally(() => {
    if (_alloyLoadPromise === trackedPromise) {
      _alloyLoadPromise = null;
    }
  });
  _alloyLoadPromise = trackedPromise;
  return _alloyLoadPromise;
}

/**
 * Resolves the inline widget edge globals (window.LLM_APPS_EDGE_ENABLED /
 * _DATASTREAM_ID / _ORG_ID) into an `applyAdobeHandles` config, or null when
 * edge is not fully configured. Pure (no window access) so it stays
 * unit-testable; the caller reads the globals and passes them in.
 *
 * @param {{edgeEnabled?: boolean, datastreamId?: string, orgId?: string}} [source]
 * @returns {{datastreamId: string, orgId: string}|null}
 */
export function _resolveEdgeConfig (source) {
  const { edgeEnabled, datastreamId, orgId } = source || {};
  // Strict === true, not truthy: the global is emitted as a boolean, so a
  // stringified "false" (a producer regression) must not read as enabled.
  if (edgeEnabled !== true || !datastreamId || !orgId) return null;
  return { datastreamId, orgId };
}

/**
 * Builds the XDM for a single widget interaction. `web.webInteraction`
 * (linkClicks = 1) is required for the event to register as an Adobe
 * Analytics hit, not just land in the AEP dataset. Pure (takes an
 * element-like {dataset, textContent}) so it's unit-testable.
 *
 * @param {{dataset?: {analytics?: string}, textContent?: string}} el
 * @returns {object} XDM
 */
export function _buildInteractionXdm (el) {
  const raw =
    (el && el.dataset && el.dataset.analytics) ||
    (el && typeof el.textContent === 'string' ? el.textContent.trim() : '') ||
    'widget-interaction';
  const label = raw.slice(0, 100); // cap every source, not just textContent
  return {
    eventType: 'web.webinteraction.linkClicks',
    web: { webInteraction: { name: label, linkClicks: { value: 1 }, type: 'other' } }
  };
}

/**
 * Applies Adobe personalization/identity handles from the MCP tool result
 * (`_meta.adobe.handles`) via the Adobe Web SDK. Loads and configures the SDK
 * whenever `datastreamId`/`orgId` are supplied — even with no handles — so a
 * later `sendAdobeEvent` has a configured alloy to send through; only the
 * `applyResponse` step is skipped when handles are absent. No-ops when
 * `datastreamId`/`orgId` are missing — never throws into the widget's render path.
 *
 * `orgId` here is only ever the app's own imsOrgId (baked into actions.json at
 * deploy time), never verified against the datastream it's actually configured
 * to use. `_meta.adobe.orgId`, when present, is that same datastream's REAL
 * owning org, read server-side from THIS tool call's own Edge response
 * (loader.js's wrapHandlerWithEdge) -- ground truth, for free, already
 * available by the time this runs (toolResult is awaited below before
 * configure() fires). Preferred over the passed-in orgId whenever present.
 *
 * @param {LLMApp} bridge
 * @param {{ datastreamId: string, orgId: string }} config
 * @returns {Promise<object|null>}
 */
export async function applyAdobeHandles (bridge, { datastreamId, orgId } = {}) {
  if (!datastreamId || !orgId) return null;
  const result = await bridge.toolResult;
  const handles = _extractAdobeHandles(result);
  const resolvedOrgId = _extractAdobeOrgId(result) || orgId;
  try {
    await _loadAlloyScripts();
    await window.alloy('configure', { datastreamId, orgId: resolvedOrgId });
    if (!handles) return null;
    const responseBody = { handle: handles };
    const response = await window.alloy('applyResponse', { responseBody, renderDecisions: true });
    return response;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`${LOG_PREFIX} applyAdobeHandles failed:`, err);
    return null;
  }
}

/**
 * Sends a client-side analytics event to Adobe Edge Network, reusing the
 * SAME identityMap the server used (`_meta.adobe.identityMap`)
 * so client- and server-side events stitch to one identity. Never call
 * this for the widget's OWN initial tool invocation — the server already
 * sent that event; this is for POST-render interactions only.
 *
 * @param {LLMApp} bridge
 * @param {object} xdm - caller-supplied XDM fields (eventType, etc.)
 * @returns {Promise<object|null>}
 */
export async function sendAdobeEvent (bridge, xdm) {
  const result = await bridge.toolResult;
  const identityMap = _extractAdobeIdentityMap(result);
  if (!identityMap || typeof window === 'undefined' || typeof window.alloy !== 'function') return null;
  try {
    const sentXdm = { ...xdm, identityMap };
    const response = await window.alloy('sendEvent', { xdm: sentXdm });
    return response;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`${LOG_PREFIX} sendAdobeEvent failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------
// Vendor Extensions — ChatGPT  (window.openai)
//
// Only truly ChatGPT-specific APIs that have NO standard equivalent.
// ---------------------------------------------------------------

/**
 * Thin wrapper around ChatGPT's `window.openai` runtime.
 * Only exposes capabilities with no standard equivalent.
 *
 * @private — accessed via `app.chatgpt`, never instantiated directly.
 */
class ChatGPTExtensions {
  /** @param {object} api — reference to `window.openai` */
  constructor(api) {
    this._api = api;
  }

  // --- State persistence (ChatGPT-only) -----------------------

  /** Persisted UI state snapshot. */
  get widgetState() { return this._api.widgetState ?? null; }

  /** Persist a new UI state snapshot (synchronous, host persists async). */
  setWidgetState(state) { this._api.setWidgetState?.(state); }

  // --- File APIs (ChatGPT-only) -------------------------------

  /**
   * Upload a file and receive a `fileId`.
   * Supports image/png, image/jpeg, image/webp.
   * @param {File} file
   * @returns {Promise<{ fileId: string }>}
   */
  uploadFile(file) { return this._call('uploadFile', file); }

  /**
   * Get a temporary download URL for a file.
   * @param {{ fileId: string }} opts
   * @returns {Promise<{ downloadUrl: string }>}
   */
  getFileDownloadUrl(opts) { return this._call('getFileDownloadUrl', opts); }

  // --- UI Control (ChatGPT-only) ------------------------------

  /**
   * Open a host-controlled modal, optionally targeting another
   * registered template URI.
   * @param {{ template?: string, params?: object }} [opts]
   * @returns {Promise<void>}
   */
  requestModal(opts) { return this._call('requestModal', opts); }

  /** Close this widget. */
  requestClose() { this._api.requestClose?.(); }

  /**
   * Open Instant Checkout (when enabled).
   * @param {object} opts — checkout payload
   * @returns {Promise<void>}
   */
  requestCheckout(opts) { return this._call('requestCheckout', opts); }

  /**
   * Set the "Open in <App>" URL shown in fullscreen mode.
   * @param {{ href: string }} opts
   */
  setOpenInAppUrl(opts) { this._api.setOpenInAppUrl?.(opts); }

  /** Current view identifier. @returns {string|null} */
  get view() { return this._api.view ?? null; }

  /**
   * Open ChatGPT's native account-linking sheet. Undocumented (not in the
   * official Apps SDK reference) — works around a ChatGPT bug where
   * window.openai.callTool to an oauth2-scheme tool 400s.
   *
   * Don't trust the resolved value — didConnect can be true even when the
   * user declined. Re-fetch your data and read auth state from that result.
   *
   * @param {object} [opts]
   * @returns {Promise<{ didConnect?: boolean, linkId?: string }>}
   */
  requestConnectSheet(opts) { return this._call('requestConnectSheet', opts); }

  /** Whether the host actually implements requestConnectSheet (not just this wrapper method). */
  get supportsConnectSheet() { return typeof this._api.requestConnectSheet === 'function'; }

  // --- Internal -----------------------------------------------

  /** @private */
  _call(method, ...args) {
    const fn = this._api[method];
    if (!fn) {
      return Promise.reject(new Error(`chatgpt.${method} is not available`));
    }
    return fn.apply(this._api, args);
  }
}

// ---------------------------------------------------------------
// LLMApp
// ---------------------------------------------------------------
export class LLMApp {
  /**
   * @param {object} options
   * @param {{ name: string, version: string }} options.appInfo
   *   Identity sent to the host during ui/initialize.
   *
   * @param {object} [options.appCapabilities]
   *   Capabilities declared to the host during ui/initialize.
   *   @param {Array<'inline'|'fullscreen'|'pip'>} [options.appCapabilities.availableDisplayModes]
   *   @param {{ listChanged?: boolean }} [options.appCapabilities.tools]
   *   @param {object} [options.appCapabilities.experimental]
   *
   * @example
   *   const app = new LLMApp({
   *     appInfo: { name: 'ProductShowcase', version: '1.0.0' },
   *     appCapabilities: {
   *       availableDisplayModes: ['inline', 'fullscreen'],
   *     },
   *   });
   */
  constructor(options) {
    if (!options?.appInfo?.name || !options?.appInfo?.version) {
      throw new Error(`${LOG_PREFIX} appInfo.name and appInfo.version are required`);
    }
    const { appInfo, appCapabilities } = options;
    this._appInfo = { name: appInfo.name, version: appInfo.version };
    this._capabilities = appCapabilities ?? {};
    this._target = typeof window !== 'undefined' ? window.parent : null;
    this._targetOrigin = '*';

    // State
    this._rpcId = 0;
    this._pendingRequests = new Map();
    this._connected = false;
    this._destroyed = false;
    this._messageHandler = null;

    // Host data from ui/initialize result (McpUiInitializeResult)
    this._hostContext = {};
    this._hostCapabilities = {};
    this._hostInfo = {};

    // Context change observers
    this._contextChangeCallbacks = [];

    // Tool input partial streaming callbacks
    this._toolInputPartialCallbacks = [];

    // Repeat tool-result callbacks (fire on every tool-result, not just the first)
    this._toolResultCallbacks = [];

    // Auto-resize observer
    this._resizeObserver = null;
    this._resizeDebounceTimer = null;

    // One-shot promises — one per widget lifecycle
    this._toolResultResolve = null;
    /** Promise that resolves with the `ui/notifications/tool-result` params. */
    this.toolResult = new Promise((resolve) => {
      this._toolResultResolve = resolve;
    });

    this._toolInputResolve = null;
    /** Promise that resolves with the `ui/notifications/tool-input` params. */
    this.toolInput = new Promise((resolve) => {
      this._toolInputResolve = resolve;
    });

    this._toolCancelledResolve = null;
    /** Promise that resolves with `{ reason }` if the tool is cancelled. */
    this.toolCancelled = new Promise((resolve) => {
      this._toolCancelledResolve = resolve;
    });

    // Vendor extensions (lazy-initialised on first access)
    this._chatgpt = undefined;
  }

  // ---------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------

  /** Whether this code is running inside an iframe. */
  get isEmbedded() {
    return typeof window !== 'undefined' && window.parent !== window;
  }

  /** Whether the ui/initialize handshake has completed. */
  get isConnected() {
    return this._connected;
  }

  /**
   * Detected host name. Prefers hostInfo.name from the handshake,
   * falls back to environment sniffing.
   * @returns {'chatgpt'|'claude'|string|'unknown'|null}
   */
  get host() {
    if (typeof window === 'undefined') return null;
    if (this._hostInfo?.name) return this._hostInfo.name;
    if (window.openai) return 'chatgpt';
    try {
      if (window.location.origin.includes('claudemcpcontent.com')) return 'claude';
    } catch { /* cross-origin access may throw */ }
    return 'unknown';
  }

  /**
   * Host context from the ui/initialize result.
   * Contains theme, styles, locale, timeZone, displayMode,
   * availableDisplayModes, containerDimensions, platform,
   * deviceCapabilities, safeAreaInsets, userAgent, toolInfo.
   *
   * Updated live when `ui/notifications/host-context-changed` arrives.
   *
   * @returns {object}
   */
  get hostContext() {
    return this._hostContext;
  }

  /**
   * Host capabilities from the ui/initialize result.
   * Contains openLinks, serverTools, serverResources, logging, sandbox.
   * Use for feature detection before calling methods.
   *
   * @returns {object}
   */
  get hostCapabilities() {
    return this._hostCapabilities;
  }

  /**
   * Host identity from the ui/initialize result.
   * @returns {{ name?: string, version?: string }}
   */
  get hostInfo() {
    return this._hostInfo;
  }

  /**
   * ChatGPT vendor extensions (via `window.openai`).
   * Returns `null` when not running inside ChatGPT.
   * Only exposes ChatGPT-specific APIs with no standard equivalent.
   *
   * @returns {ChatGPTExtensions|null}
   */
  get chatgpt() {
    if (this._chatgpt === undefined) {
      const api = typeof window !== 'undefined' ? window.openai : null;
      this._chatgpt = api ? new ChatGPTExtensions(api) : null;
    }
    return this._chatgpt;
  }

  // ---------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------

  /**
   * Connect to the host — starts listening and performs the ui/initialize
   * handshake. Parses the McpUiInitializeResult into hostContext,
   * hostCapabilities, and hostInfo.
   *
   * Safe to call when not embedded (returns immediately, isConnected = false).
   *
   * @returns {Promise<LLMApp>} this instance (for chaining)
   */
  async connect() {
    if (this._destroyed) throw new Error(`${LOG_PREFIX} SDK instance is destroyed`);

    this._startListening();

    if (!this.isEmbedded) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Not in iframe — running in standalone mode`);
      return this;
    }

    try {
      const result = await this.request('ui/initialize', {
        appInfo: this._appInfo,
        appCapabilities: this._capabilities,
        protocolVersion: PROTOCOL_VERSION,
      });

      // Parse McpUiInitializeResult
      this._hostContext = result?.hostContext ?? {};
      this._hostCapabilities = result?.hostCapabilities ?? {};
      this._hostInfo = result?.hostInfo ?? {};

      this.notify('ui/notifications/initialized', {});
      this._connected = true;
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Connected (host: ${this.host})`);

      // ChatGPT: on page refresh, tool-result notification is not re-sent,
      // but data is available synchronously on window.openai.toolOutput.
      // Resolve toolResult immediately if the promise is still pending.
      if (this._toolResultResolve && typeof window !== 'undefined' && window.openai?.toolOutput) {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} Resolving toolResult from window.openai.toolOutput`);
        this._toolResultResolve(_reconnectToolResult(window.openai));
        this._toolResultResolve = null;
      }
      if (typeof window !== 'undefined' && window.openai?.toolOutput) {
        this._toolResultCallbacks.forEach((fn) => {
          try { fn({ structuredContent: window.openai.toolOutput }); } catch { /* consumer error */ }
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} Handshake failed:`, err);
    }

    return this;
  }

  /** Stop listening and clean up (including vendor extensions). */
  destroy() {
    this._destroyed = true;
    this._connected = false;
    this._contextChangeCallbacks = [];
    this._toolInputPartialCallbacks = [];
    this._toolResultCallbacks = [];
    clearTimeout(this._resizeDebounceTimer);
    this._resizeDebounceTimer = null;
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._messageHandler && typeof window !== 'undefined') {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
    }
    this._pendingRequests.forEach(({ reject }) => reject(new Error('SDK instance destroyed')));
    this._pendingRequests.clear();
  }

  // ---------------------------------------------------------------
  // Actions — sending to host (standard protocol)
  // ---------------------------------------------------------------

  /**
   * Call a tool from the UI.
   * @param {string} name - Tool name
   * @param {Object} [args] - Tool arguments
   * @returns {Promise<Object>} Tool result { content, structuredContent }
   */
  async callTool(name, args = {}) {
    return this.request('tools/call', { name, arguments: args });
  }

  /**
   * Post a follow-up message in the conversation.
   * Note: spec shows content as a single ContentBlock, but hosts
   * (ChatGPT) validate it as an array. Using array for compatibility.
   * @param {string} text - Message text
   * @returns {Promise<Object>} Host response
   */
  async sendMessage(text) {
    return this.request('ui/message', {
      role: 'user',
      content: [{ type: 'text', text }],
    });
  }

  /**
   * Update model-visible context from the UI.
   * @param {string} text - Context description
   * @returns {Promise<Object>} Host response
   */
  async updateModelContext(text) {
    return this.request('ui/update-model-context', {
      content: [{ type: 'text', text }],
    });
  }

  /**
   * Open an external link via the host. The host may show a confirmation.
   *
   * @param {string} url - URL to open
   * @returns {Promise<Object>} Host response
   */
  async openLink(url) {
    return this.request('ui/open-link', { url });
  }

  /**
   * Request a display mode change (inline, fullscreen, pip).
   *
   * @param {'inline'|'fullscreen'|'pip'} mode
   * @returns {Promise<{ mode: string }>} Actual mode set by the host
   */
  async requestDisplayMode(mode) {
    return this.request('ui/request-display-mode', { mode });
  }

  /**
   * Report the widget's current size to the host.
   *
   * @param {number} width - Viewport width in pixels
   * @param {number} height - Viewport height in pixels
   */
  reportSize(width, height) {
    this.notify('ui/notifications/size-changed', { width, height });
    // ChatGPT-specific: also call the vendor API directly
    if (typeof window !== 'undefined') {
      try { window.openai?.notifyIntrinsicHeight?.(height); } catch (_) { /* gated in dev mode */ }
    }
  }

  /**
   * Read a resource from the MCP server (proxied through the host).
   *
   * @param {string} uri - Resource URI (e.g. 'ui://my-server/config')
   * @returns {Promise<Object>} Resource contents { contents: [...] }
   */
  async readResource(uri) {
    return this.request('resources/read', { uri });
  }

  /**
   * Send a log message to the host.
   * Requires `app.hostCapabilities.logging` to be present.
   *
   * @param {'debug'|'info'|'warning'|'error'} level - Log level
   * @param {string} message - Log message
   */
  log(level, message) {
    this.notify('notifications/message', {
      level,
      data: message,
    });
  }

  /**
   * Start automatic size reporting via ResizeObserver.
   * Observes the target element and sends `ui/notifications/size-changed`
   * whenever its dimensions change (debounced to 150ms).
   *
   * @param {HTMLElement} [target=document.body] - Element to observe
   * @returns {function} stop - call to disconnect the observer
   */
  autoResize(target) {
    if (typeof ResizeObserver === 'undefined') return () => {};

    const el = target || (typeof document !== 'undefined' ? document.body : null);
    if (!el) return () => {};

    // Disconnect any previous observer
    clearTimeout(this._resizeDebounceTimer);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }

    let lastW = 0;
    let lastH = 0;

    this._resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = setTimeout(() => {
        if (!this._destroyed) this.reportSize(w, h);
      }, 150);
    });

    this._resizeObserver.observe(el);

    return () => {
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = null;
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
    };
  }

  // ---------------------------------------------------------------
  // Context observation
  // ---------------------------------------------------------------

  /**
   * Register a callback for host context changes (theme, displayMode,
   * locale, containerDimensions, etc.). Fires when the host sends
   * `ui/notifications/host-context-changed`.
   *
   * The callback receives the merged (full) hostContext after the update.
   *
   * @param {function} callback — receives the updated hostContext
   * @returns {function} unsubscribe — call it to stop listening
   *
   * @example
   *   const stop = app.onContextChange(ctx => {
   *     document.body.dataset.theme = ctx.theme;
   *     if (ctx.displayMode === 'fullscreen') showExpandedLayout();
   *   });
   *   // later: stop();
   */
  onContextChange(callback) {
    this._contextChangeCallbacks.push(callback);
    return () => {
      this._contextChangeCallbacks = this._contextChangeCallbacks
        .filter((fn) => fn !== callback);
    };
  }

  /**
   * Register a callback for streaming tool input arguments.
   * Fires on each `ui/notifications/tool-input-partial` notification
   * sent by the host while the agent is still streaming arguments.
   *
   * The callback receives the best-effort recovered arguments object.
   * Returns an unsubscribe function.
   *
   * @param {function} callback — receives partial { arguments } params
   * @returns {function} unsubscribe
   *
   * @example
   *   const stop = app.onToolInputPartial((params) => {
   *     if (params.arguments?.title) showTitle(params.arguments.title);
   *   });
   */
  onToolInputPartial(callback) {
    this._toolInputPartialCallbacks.push(callback);
    return () => {
      this._toolInputPartialCallbacks = this._toolInputPartialCallbacks
        .filter((fn) => fn !== callback);
    };
  }

  /**
   * Register a callback for every `ui/notifications/tool-result` the host
   * sends for this widget instance, not just the first. Use this instead of
   * the one-shot `toolResult` Promise for a widget that stays mounted across
   * multiple tool calls (e.g. pinned in `pip`) and needs to re-render each
   * time fresh structuredContent arrives, per
   * https://developers.openai.com/apps-sdk/build/state-management.
   *
   * @param {function} callback — receives the `ui/notifications/tool-result` params
   * @returns {function} unsubscribe
   *
   * @example
   *   const stop = app.onToolResult((result) => renderCart(block, result.structuredContent, app));
   */
  onToolResult(callback) {
    this._toolResultCallbacks.push(callback);
    return () => {
      this._toolResultCallbacks = this._toolResultCallbacks
        .filter((fn) => fn !== callback);
    };
  }

  // ---------------------------------------------------------------
  // Host style helpers
  // ---------------------------------------------------------------

  /**
   * Apply host-provided CSS variables and fonts to the document.
   * Reads `hostContext.styles.variables` and sets each as a CSS
   * custom property. Also injects font CSS and sets `color-scheme`.
   *
   * @param {HTMLElement} [target=document.documentElement] — element
   *   to apply CSS variables to
   */
  applyHostStyles(target) {
    const el = target || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el) return;

    const { styles, theme } = this._hostContext;

    // Apply CSS variables
    if (styles?.variables) {
      Object.entries(styles.variables).forEach(([key, value]) => {
        if (value != null) el.style.setProperty(key, value);
      });
    }

    // Set color-scheme for light-dark() CSS function support
    if (theme) {
      el.style.setProperty('color-scheme', theme === 'dark' ? 'dark' : 'light');
    }

    // Inject font CSS
    if (styles?.css?.fonts && typeof document !== 'undefined') {
      const existing = document.getElementById('llmapps-host-fonts');
      if (!existing) {
        const style = document.createElement('style');
        style.id = 'llmapps-host-fonts';
        style.textContent = styles.css.fonts;
        document.head.appendChild(style);
      }
    }
  }

  /**
   * Apply host-provided container dimensions as CSS on the target element.
   * Handles fixed vs flexible sizing per the spec.
   *
   * @param {HTMLElement} [target=document.documentElement]
   */
  applyContainerDimensions(target) {
    const el = target || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el) return;

    const dims = this._hostContext.containerDimensions;
    if (!dims) return;

    // Height: fixed or flexible
    if ('height' in dims) {
      el.style.height = '100vh';
    } else if ('maxHeight' in dims && dims.maxHeight) {
      el.style.maxHeight = `${dims.maxHeight}px`;
    }

    // Width: fixed or flexible
    if ('width' in dims) {
      el.style.width = '100vw';
    } else if ('maxWidth' in dims && dims.maxWidth) {
      el.style.maxWidth = `${dims.maxWidth}px`;
    }
  }

  // ---------------------------------------------------------------
  // Low-level JSON-RPC
  // ---------------------------------------------------------------

  /**
   * Send a JSON-RPC request (has id, expects response).
   * @param {string} method
   * @param {Object} [params]
   * @returns {Promise<any>} result
   */
  request(method, params, { timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line no-plusplus
      const id = ++this._rpcId;

      let timer = null;
      if (timeout > 0) {
        timer = setTimeout(() => {
          this._pendingRequests.delete(id);
          reject(new Error(`${LOG_PREFIX} Request timed out: ${method} (${timeout}ms)`));
        }, timeout);
      }

      this._pendingRequests.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      this._send({ jsonrpc: '2.0', id, method, params });
    });
  }

  /**
   * Send a JSON-RPC notification (no id, fire-and-forget).
   * @param {string} method
   * @param {Object} [params]
   */
  notify(method, params) {
    this._send({ jsonrpc: '2.0', method, params });
  }

  // ---------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------

  _send(message) {
    if (!this._target) return;
    this._target.postMessage(message, this._targetOrigin);
  }

  _startListening() {
    if (this._messageHandler || typeof window === 'undefined') return;

    this._messageHandler = (event) => {
      if (this._target && event.source !== this._target) return;

      const msg = event.data;
      if (!msg || msg.jsonrpc !== '2.0') return;

      // --- JSON-RPC responses (to our requests) ---
      if (typeof msg.id === 'number' || typeof msg.id === 'string') {
        // Check if this is a request FROM the host (has method + id)
        if (typeof msg.method === 'string') {
          this._handleHostRequest(msg);
          return;
        }
        const pending = this._pendingRequests.get(msg.id);
        if (!pending) return;
        this._pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(msg.error);
        } else {
          pending.resolve(msg.result);
        }
        return;
      }

      // --- JSON-RPC notifications from the host ---
      if (typeof msg.method !== 'string') return;

      if (msg.method === 'ui/notifications/tool-result') {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} tool-result received`);
        if (this._toolResultResolve) {
          this._toolResultResolve(msg.params);
          this._toolResultResolve = null;
        }
        this._toolResultCallbacks.forEach((fn) => {
          try { fn(msg.params); } catch { /* consumer error */ }
        });
      }

      if (msg.method === 'ui/notifications/tool-input') {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} tool-input received`);
        if (this._toolInputResolve) {
          this._toolInputResolve(msg.params);
          this._toolInputResolve = null;
        }
      }

      if (msg.method === 'ui/notifications/tool-input-partial') {
        this._toolInputPartialCallbacks.forEach((fn) => {
          try { fn(msg.params); } catch { /* consumer error */ }
        });
      }

      if (msg.method === 'ui/notifications/tool-cancelled') {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} tool-cancelled received`);
        if (this._toolCancelledResolve) {
          this._toolCancelledResolve(msg.params);
          this._toolCancelledResolve = null;
        }
      }

      if (msg.method === 'ui/notifications/host-context-changed') {
        if (msg.params && typeof msg.params === 'object') {
          // Skip if the incoming context is identical to what we already have
          const dominated = Object.keys(msg.params).every(
            (k) => JSON.stringify(this._hostContext[k]) === JSON.stringify(msg.params[k]),
          );
          if (dominated) return;

          // eslint-disable-next-line no-console
          console.log(`${LOG_PREFIX} host-context-changed received`);
          Object.assign(this._hostContext, msg.params);
        }
        this._contextChangeCallbacks.forEach((fn) => {
          try { fn(this._hostContext); } catch { /* consumer error */ }
        });
      }
    };

    window.addEventListener('message', this._messageHandler, { passive: true });
  }

  /**
   * Handle JSON-RPC requests FROM the host (messages with both id and method).
   * @private
   */
  _handleHostRequest(msg) {
    // ui/resource-teardown — host is about to destroy this widget
    if (msg.method === 'ui/resource-teardown') {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} resource-teardown received (reason: ${msg.params?.reason})`);
      // Respond to acknowledge
      this._send({ jsonrpc: '2.0', id: msg.id, result: {} });
      // Clean up
      this.destroy();
    }
  }
}

// ---------------------------------------------------------------
// Factory (convenience for one-liner setup)
// ---------------------------------------------------------------

/**
 * Create and connect an app in one call.
 *
 * @param {object} options — same options as `new LLMApp(options)`
 *
 * @example
 *   const app = await createApp({
 *     appInfo: { name: 'MyApp', version: '1.0.0' },
 *     appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
 *   });
 *   const result = await app.toolResult;
 *
 * @returns {Promise<LLMApp>}
 */
export async function createApp(options) {
  const app = new LLMApp(options);
  await app.connect();
  return app;
}

export default LLMApp;

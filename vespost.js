/***************************************************************************
 *          ___       ___
 *         /   \     /   \    VESvault
 *         \__ /     \ __/    Encrypt Everything without fear of losing the Key
 *            \\     //                   https://vesvault.com https://ves.host
 *             \\   //
 *     ___      \\_//
 *    /   \     /   \         VESpost: e2ee Collaborative Sticky Notes
 *    \__ /     \ __/         libVES.subtle.js Integration Demo
 *       \\     //
 *        \\   //
 *         \\_//
 *         /   \
 *         \___/
 *
 *
 * (c) 2025 - 2026 VESvault Corp
 * Jim Zubov <jz@vesvault.com>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License in the accompanying LICENSE
 * file, or at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied.  See the License for the specific language governing
 * permissions and limitations under the License.
 ***************************************************************************/

class VESpost {
    constructor(ves, donefn) {
        this.ves = ves;
        this.donefn = donefn;
        this.items = {};
        this.dom = this.addElement(document.getElementsByTagName('body')[0], 'div', 'vespost', (dom) => {
            dom.id = 'vespost';
            this.addElement(dom, 'div', 'header', (hdr) => {
                this.addElement(hdr, 'div', 'account', this.ves.short());
                this.addElement(hdr, 'button', 'dismiss', '\u00d7').onclick = () => (this.done(), false);
            });
            this.container = this.addElement(dom, 'div', 'items updating', (e) => this.addElement(e, 'div', 'spinner standby'));
            this.ves.onitemadd = this.ves.onitemremove = this.ves.onitemcreate = this.ves.onitemdelete = this.ves.onitemchange = (ev) => this.event(ev);
            this.ves.onauthexpire = (e) => this.done();
            this.ves.start(false).then(() => Object.keys(this.items).sort().reduceRight((prev, k) => {
                let cur = this.items[k];
                if (prev) prev.parentNode.insertBefore(cur, prev);
                return cur;
            }, null)).catch((er) => (console.log(er), this.done(er))).then(() => {
                this.blankitem();
                this.container.classList.remove('updating');
            });
        });
    }

    addElement(dom, tag, cls, value) {
        let e = document.createElement(tag);
        if (cls) e.className = cls;
        this.setValue(e, value);
        dom.appendChild(e);
        return e;
    }

    setElement(dom, cls, value) {
        let e = dom.getElementsByClassName(cls);
        for (let i = 0; i < e.length; i++) this.setValue(e[i], value);
    }

    setValue(dom, value) {
        if (typeof(value) == 'function') value(dom);
        else if (value != null) {
            value = String(value);
            if (dom.readOnly !== undefined) dom.value = value;
            else dom.innerHTML = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        }
    }

    setError(dom, er, cls) {
        let es = dom.getElementsByClassName(cls || 'error');
        if (er) {
            let e = es[0];
            if (e.innerHTML != '') {
                e = e.cloneNode();
                es[0].parentNode.appendChild(e);
            }
            this.setValue(e, (er?.message ?? String(er)));
        } else {
            for (let i = es.length - 1; i > 0; i--) es[i].remove();
            es[0].innerHTML = '';
        }
    }

    getElement(dom, cls) {
        let e = dom.getElementsByClassName(cls)[0];
        if (!e) return null;
        return e.readOnly !== undefined ? e.value : e.innerHTML.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    }

    alive() {
        this.ves.lock(600);
    }

    event(ev) {
        console.log(ev);
        let item = ev.detail.item;
        return this.loaditem(item);
    }

    createitem(item) {
        let uri = item.short();
        let menu = null;
        let dom = this.addElement(this.container, 'div', 'item loading', (dom) => {
            let cl = dom.classList;
            this.addElement(dom, 'div', 'title', (e) => {
                this.addElement(e, 'span', 'uri', uri);
                this.addElement(e, 'button', 'openmenu standbyload', '\u2261').onclick = (ev) => {
                    this.alive();
                    let hide = () => (menu.remove(), menu = null);
                    menu ||= this.addElement(dom, 'div', 'menu', (menu) => {
                        this.addElement(menu, 'a', 'menuitem showlog', (a) => {
                            a.href = '#';
                            a.innerHTML = 'History Log';
                        }).onclick = (ev) => (this.showlog(item, dom), false);
                        this.addElement(menu, 'a', 'menuitem delete', (a) => {
                            a.href = '#';
                            a.innerHTML = 'Delete';
                        }).onclick = (ev) => {
                            cl.add('updating');
                            item.delete().then(() => this.loaditem(item)).catch((er) => this.setError(dom, er)).finally(() => cl.remove('updating'));
                            return false;
                        };
                        this.addElement(menu, 'a', 'menuitem refuse', (a) => {
                            a.href = '#';
                            a.innerHTML = 'Refuse';
                        }).onclick = (ev) => {
                            cl.add('updating');
                            item.refuse().then(() => this.loaditem(item)).catch((er) => this.setError(dom, er)).finally(() => cl.remove('updating'));
                            return false;
                        };
                    });
                    menu.onclick = hide;
                };
            });
            this.addElement(dom, 'div', 'info', (e) => {
                let fld = this.addElement(e, 'textarea', 'value');
                fld.placeholder = '(enter a new note)';
                let tmout = null;
                let save = Promise.resolve(null);
                let busy = 0;
                fld.oninput = (ev) => {
                    this.alive();
                    if (tmout) clearTimeout(tmout), tmout = null, busy--;
                    if (fld.value == fld.defaultValue) return busy > 0 || cl.remove('updating');
                    cl.add('updating');
                    busy++;
                    tmout = setTimeout(() => {
                        tmout = null;
                        let val = fld.value;
                        save = save.then(() => item.put(val)).then(() => {
                            fld.defaultValue = val;
                            if (!uri) {
                                uri = item.short();
                                this.setElement(dom, 'title', (e) => this.setElement(e, 'uri', uri));
                                if (this.items[uri]) this.items[uri].remove();
                                this.items[uri] = dom;
                                this.blankitem();
                            }
                        }).then(() => this.loaditem(item)).catch((er) => this.setError(dom, er)).finally(() => {
                            --busy || cl.remove('updating');
                            cl.remove('changed');
                        });
                    }, 2000);
                };
                this.addElement(e, 'div', 'valueerror');
            });
            this.addElement(dom, 'div', 'shares');
            this.addElement(dom, 'form', 'newshare', (nsh) => {
                let cl = nsh.classList;
                let input = this.addElement(nsh, 'input', 'uri');
                let admin;
                input.placeholder = "(add an email or vault id to the access list)";
                input.oninput = (ev) => cl[input.value ? 'add' : 'remove']('editing');
                input.autocomplete = 'off';
                this.addElement(nsh, 'div', 'dropdown', (e) => {
                    this.addElement(e, 'label', 'admin', (lbl) => {
                        admin = this.addElement(lbl, 'input');
                        admin.type = 'checkbox';
                        this.addElement(lbl, 'span', null, 'admin');
                    });
                });
                this.addElement(nsh, 'button', 'add standby', (btn) => {
                    btn.innerHTML = '+';
                    btn.type = 'submit';
                }).onclick = (ev) => {
                    this.alive();
                    if (cl.contains('updating')) return false;
                    if (!input.value) return input.focus(), false;
                    input.disabled = true;
                    cl.add('updating');
                    let add = [input.value];
                    if (admin?.checked) {
                        let ref = item.vault.vault(input.value);
                        if (ref?.externalId) add.push(libVES.Vault.toUri({domain: '.admin', externalId: ref.externalId}));
                    }
                    item.add(add).then(() => (input.value = '', admin.checked = false, this.loaditem(item))).catch((er) => this.setError(dom,er)).finally(() => cl.remove('updating'), cl.remove('editing'), input.disabled = false, input.focus());
                    return false;
                };
            });
            this.addElement(dom, 'div', 'errors', (e) => {
                this.addElement(e, 'div', 'error');
                this.addElement(e, 'button', 'dismiss', '\u00d7').onclick = (ev) => (this.setError(dom, null), false);
            });
        });
        return dom;
    }

    loaditem(item) {
        let uri = item.short();
        let litem = item.latest();
        let dom = (this.items[uri] ||= this.createitem(litem));
        let domcl = dom.classList;
        let setflags = (e, sh) => {
            let cl = e.classList;
            let setcls = (cls, flag) => cl[flag ? 'add' : 'remove'](cls);
            setcls('owner', sh.owner);
            setcls('admin', sh.admin);
            setcls('current', sh.current);
        };
        return Promise.all([
            Promise.all([(uri ? item.get() : ''), item.writable()]).then(([text, rw]) => (this.setElement(dom, 'value', (e) => {
                if (e.value == e.defaultValue) e.value = e.defaultValue = text;
                else if (e.value != text) domcl.add('changed');
                e.readOnly = !rw;
                domcl[rw ? 'remove' : 'add']('readonly');
            }), this.setElement(dom, 'valueerror', ''))).catch((er) => this.setError(dom, er, 'valueerror')),
            item.share().then((shares) => {
                let uris = {};
                shares.map((sh) => uris[sh.short()] = sh);
                this.setElement(dom, 'share', (e) => {
                    let cl = e.classList;
                    let uri = this.getElement(e, 'uri');
                    let sh;
                    if ((sh = uris[uri])) {
                        setflags(e, sh);
                        delete(uris[uri]);
                        cl.remove('deleted');
                    } else cl.add('deleted');
                });
                this.setElement(dom, 'shares', (e) => {
                    for (var uri in uris) this.addElement(e, 'div', 'share', (e) => (((uri) => {
                        let cl = e.classList;
                        this.addElement(e, 'span', 'uri', uri);
                        this.addElement(e, 'button', 'remove standby', '\u00d7').onclick = (ev) => {
                            this.alive();
                            if (cl.contains('updating')) return false;
                            cl.add('updating');
                            litem.remove(uri).then(() => this.loaditem(litem)).catch((er) => this.setError(dom, er)).finally(() => cl.remove('updating'));
                            return false;
                        };
                        this.addElement(e, 'button', 'add standby', '+').onclick = (ev) => {
                            this.alive();
                            if (cl.contains('updating')) return false;
                            cl.add('updating');
                            litem.add(uri).then(() => this.loaditem(litem)).catch((er) => this.setError(dom, er)).finally(() => cl.remove('updating'));
                            return false;
                        };
                        setflags(e, uris[uri]);
                        if (uri.replace(/\!.*/, '') == litem.vault.short()) cl.add('enabled');
                    })(uri)));
                });
            }),
            (uri && item.exists().then((ex) => domcl[ex ? 'remove' : 'add']('deleted')))
        ]).then(() => {
            this.setElement(dom, 'error', '');
        }).catch((er) => {
            switch (er?.code) {
                case 'NotFound': case 'InvalidKey': break;
                default: return this.setError(dom, er);
            }
        }).finally(() => domcl.remove('loading'));
    }

    blankitem() {
        delete(this.items[null]);
        this.loaditem(this.ves.item());
    }

    showlog(item, dom) {
        this.addElement(dom, 'div', 'log', (log) => {
            let cl = log.classList;
            this.addElement(log, 'button', 'dismiss', '\u00d7').onclick = (ev) => {
                this.alive();
                item.stop();
                log.remove();
                return false;
            };
            let le = this.addElement(log, 'div', 'events standby');
            let values = [];
            let found = {};
            item.onolditemadd = item.onolditemremove = item.onolditemcreate = item.onolditemdelete =
            item.onitemadd = item.onitemremove = item.onitemcreate = item.onitemdelete = (ev) => {
                this.addElement(le, 'div', 'event', (e) => {
                    if (ev.type.match(/^old/)) e.classList.add('old');
                    this.addElement(e, 'span', 'at', ev.detail?.at?.toISOString());
                    this.addElement(e, 'span', 'id', ev.detail?.id);
                    this.addElement(e, 'span', 'type', ev.type);
                    this.addElement(e, 'span', 'version', ev.detail?.item?.version);
                    if (ev.type.match(/(add|remove)$/)) this.addElement(this.addElement(e, 'span', 'share', ev.detail?.share?.short()), 'span', 'version', ev.detail?.share?.version);
                    found[ev.detail?.item?.version] ||= this.addElement(e, 'span', 'value', (v) => {
                        values.push(ev.detail?.item?.get().then((val) => this.addElement(v, 'textarea', null, val).readOnly = true).catch((er) => (this.addElement(v, 'span', 'error'), this.setError(v, er))));
                    });
                    if (ev.detail?.author?.vault) this.addElement(e, 'span', 'author', (e) => {
                        this.addElement(e, 'span', 'uri', ev.detail.author.vault.short());
                        this.addElement(e, 'span', 'sessid', ev.detail.author.sessid);
                        this.addElement(e, 'span', 'remote', (e) => {
                            this.addElement(e, 'span', 'addr', ev.detail.author.remote);
                            let ua = window.UAParser && ev.detail.author.userAgent ? UAParser(ev.detail.author.userAgent) : null;
                            this.addElement(e, 'span', 'ua', (ua ? ua.browser.name + ' ' + ua.browser.version + ', ' + (ua.device.model ? ua.device.vendor + ' ' + ua.device.model + ', ' : '') + ua.os.name + ' ' + ua.os.version : ev.detail.author.userAgent));
                        });
                    });
                });
            };
            cl.add('updating');
            item.start(0).then(() => Promise.all(values)).catch((er) => this.setError(dom, er)).finally(() => cl.remove('updating'));
        });
    }

    done(er) {
        this.ves.stop();
        this.dom.remove();
        if (this.donefn) this.donefn(er);
    }
}

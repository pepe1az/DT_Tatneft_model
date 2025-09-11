//fix for IE
if (!window.location.origin) {
  window.location.origin = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port: '');
}


if (typeof JSV === 'undefined') {
    /**
     * JSV namespace for JSON Schema Viewer.
     * @namespace
     */
    var JSV = {
        /**
         * The root schema to load.
         */
        schema: '',

        /**
         * If true, render diagram only on init, without the jQuery Mobile UI.
         * The legend and nav tools will be rendered with any event listeners.
         */
        plain: false,

        /**
         * The version of the schema.
         */
        version: '',

        /**
         * Currently focused node
         */
        focusNode: false,

        /**
         * Currently loaded example
         */
        example: false,

        /**
         * @property {object} treeData The diagram nodes
         */
        treeData: null,

        /**
         * The initialization status of the viewer page
         */
        viewerInit: false,

        /**
         * The current viewer height
         */
        viewerHeight: 0,

        /**
         * The current viewer width
         */
        viewerWidth: 0,

        /**
         * The default duration of the node transitions
         */
        duration: 750,

        /**
         * Counter for generating unique ids
         */
        counter: 0,

        maxLabelLength: 0,

        /**
         * Default maximum depth for recursive schemas
         */
        maxDepth: 20,

        /**
         * @property {object} labels Nodes to render as non-clickable in the tree. They will auto-expand if child nodes are present.
         */
        labels: {
            allOf: true,
            anyOf: true,
            oneOf: true,
            'object{ }': true
        },

        /**
         * @property {array} baseSvg The base SVG element for the d3 diagram
         */
        baseSvg: null,

        /**
         * @property {array} svgGroup SVG group which holds all nodes and which the zoom Listener can act upon.
         */
        svgGroup: null,

        /**
         * Initializes the viewer.
         *
         * @param {object} config The configuration.
         * @param {function} callback Function to run after schemas are loaded and
         * diagram is created.
         */

        init: function(config, callback) {
            var i;
            //apply config
            for (i in config) {
                if (JSV.hasOwnProperty(i)) {
                    JSV[i] = config[i];
                }
            }

            if(JSV.plain) {
              JSV.createDiagram(callback);
                          //setup controls
                        d3.selectAll('#zoom-controls>a').on('click', JSV.zoomClick);
                        d3.select('#tree-controls>a#reset-tree').on('click', JSV.resetViewer);
              JSV.viewerInit = true;
              return;
            }

            JSV.contentHeight();
            JSV.resizeViewer();

            $(document).on('pagecontainertransition', this.contentHeight);
            $(window).on('throttledresize orientationchange', this.contentHeight);
            $(window).on('resize', this.contentHeight);

            JSV.resizeBtn();
            $(document).on('pagecontainershow', JSV.resizeBtn);
            $(window).on('throttledresize', JSV.resizeBtn);

            var cb = function() {
                callback();

                //setup search
                var items = [];

                JSV.visit(JSV.treeData, function(me) {
                    if (me.isReal) {
                        items.push(me.plainName + '|' + JSV.getNodePath(me).join('-'));
                    }
                }, function(me) {
                    return me.children || me._children;
                });

                items.sort();
                JSV.buildSearchList(items, true);

                $('#loading').fadeOut('slow');
            };
            JSV.createDiagram(cb);

            JSV.initValidator();

            //initialize error popup
            $( '#popup-error' ).enhanceWithin().popup();

            ///highlight plugin
            $.fn.highlight = function (str, className, quote) {
                var string = quote ? '\\"\\b'+str+'\\b\\"' : '\\b'+str+'\\b',
                    regex = new RegExp(string, 'g');

                return this.each(function () {
                    this.innerHTML = this.innerHTML.replace(regex, function(matched) {return '<span class="' + className + '">' + matched + '</span>';});
                });
            };

            //restore info-panel state
            $('body').on('pagecontainershow', function(event, ui) {
                var page = ui.toPage;

                if(page.attr('id') === 'viewer-page' && JSV.viewerInit) {
                    if(page.jqmData('infoOpen')) {
                        $('#info-panel'). panel('open');
                    }
                    //TODO: add this to 'pagecontainercreate' handler on refactor???
                    JSV.contentHeight();
                    if($('svg#jsv-tree').height() === 0) {
                        $('svg#jsv-tree').attr('width', $('#main-body').width())
                                         .attr('height', $('#main-body').height());
                        JSV.resizeViewer();
                        JSV.resetViewer();

                    }

                }
            });

            //store info-panel state
            $('body').on('pagecontainerbeforehide', function(event, ui) {
                var page = ui.prevPage;
                if(page.attr('id') === 'viewer-page') {
                    page.jqmData('infoOpen', !!page.find('#info-panel.ui-panel-open').length);
                }
            });

            //resize viewer on panel open/close
            $('#info-panel').on('panelopen', function() {
                var focus = JSV.focusNode;

                JSV.resizeViewer();
                if(focus) {
                    d3.select('#n-' + focus.id).classed('focus',true);
                    JSV.setPermalink(focus);
                }
            });

            $('#info-panel').on('panelclose', function() {
                var focus = JSV.focusNode;

                JSV.resizeViewer();
                if (focus) {
                    d3.select('#n-' + focus.id).classed('focus', false);
                    $('#permalink').html('Select a Node...');
                    $('#sharelink').val('');
                }
            });

            //scroll example/schema when tab is activated
            $('#info-panel').on( 'tabsactivate', function( event, ui ) {
                var id = ui.newPanel.attr('id');

                if(id === 'info-tab-example' || id === 'info-tab-schema') {
                    var pre = ui.newPanel.find('pre'),
                        highEl = pre.find('span.highlight')[0];

                    if(highEl) {
                        pre.scrollTo(highEl, 900);
                    }
                }
            });

            //setup example links
            $('.load-example').each(function(idx, link) {
                var ljq = $(link);
                ljq.on('click', function(evt) {
                    evt.preventDefault();
                    JSV.loadInputExample(link.href, ljq.data('target'));
                });
            });

            //setup controls
            d3.selectAll('#zoom-controls>a').on('click', JSV.zoomClick);
            d3.select('#tree-controls>a#reset-tree').on('click', JSV.resetViewer);

            $('#sharelink').on('click', function () {
               $(this).select();
            });

            JSV.viewerInit = true;

        },

        /**
         * (Re)set the viewer page height, set the diagram dimensions.
         */
        contentHeight: function() {
            var screen = $.mobile.getScreenHeight(),
                header = $('.ui-header').hasClass('ui-header-fixed') ? $('.ui-header').outerHeight() - 1 : $('.ui-header').outerHeight(),
                footer = $('.ui-footer').hasClass('ui-footer-fixed') ? $('.ui-footer').outerHeight() - 1 : $('.ui-footer').outerHeight(),
                contentCurrent = $('#main-body.ui-content').outerHeight() - $('#main-body.ui-content').height(),
                content = screen - header - footer - contentCurrent;

            $('#main-body.ui-content').css('min-height', content + 'px');
        },

        /**
         * Hides navbar button text on smaller window sizes.
         *
         * @param {number} minSize The navbar width breakpoint.
         */
        resizeBtn: function(minSize) {
            var bp = typeof minSize  === 'number' ? minSize : 800;
            var activePage = $.mobile.pageContainer.pagecontainer('getActivePage');
            if ($('.md-navbar', activePage).width() <= bp) {
                $('.md-navbar .md-flex-btn.ui-btn-icon-left').toggleClass('ui-btn-icon-notext ui-btn-icon-left');
            } else {
                $('.md-navbar .md-flex-btn.ui-btn-icon-notext').toggleClass('ui-btn-icon-left ui-btn-icon-notext');
            }
        },

        /**
         * Set version of the schema and the content
         * of any elemant with the class *schema-version*.
         *
         * @param {string} version
         */
        setVersion: function(version) {
            JSV.version = version;

            $('.schema-version').text(version);
        },

        /**
         * Display an error message.
         *
         * @param {string} msg The message to display.
         */
        showError: function(msg) {
            $('#popup-error .error-message').html(msg);
            $('#popup-error').popup('open');
        },

        initValidator: function() {
            var opts = {
                readAsDefault: 'Text',
                on: {
                    load: function(e, file) {
                        var data = e.currentTarget.result;

                        try {
                            $.parseJSON(data);
                            //console.info(data);
                            $('#textarea-json').val(data);
                        } catch(err) {
                            //JSV.showError('Unable to parse JSON: <br/>' + e);
                            JSV.showError('Failed to load ' + file.name + '. The file is not valid JSON. <br/>The error: <i>' + err + '</i>');
                        }

                    },
                    error: function(e, file) {
                        var msg = 'Failed to load ' + file.name + '. ' + e.currentTarget.error.message;

                        JSV.showError(msg);
                    }
                }
            };


            $('#file-upload, #textarea-json').fileReaderJS(opts);
            $('body').fileClipboard(opts);


            $('#button-validate').click(function() {
                var result = JSV.validate();

                if (result) {
                    JSV.showValResult(result);
                }
                //console.info(result);
            });
        },

        /**
         * Validate using tv4 and currently loaded schema(s).
         */
        validate: function() {
            var data;

            try {
                 data = $.parseJSON($('#textarea-json').val());
            } catch(e) {
                JSV.showError('Unable to parse JSON: <br/>' + e);
            }

            if (data) {
                var stop = $('#checkbox-stop').is(':checked'),
                    strict = $('#checkbox-strict').is(':checked'),
                    schema = tv4.getSchemaMap()[JSV.schema],
                    result;

                if (stop) {
                    var r = tv4.validate(data, schema, false, strict);
                    result = {
                        valid: r,
                        errors: !r ? [tv4.error] : []
                    };
                } else {
                    result = tv4.validateMultiple(data, schema, false, strict);
                }

                return result;
            }

        },

        /**
         * Display the validation result
         *
         * @param {object} result A result object, ouput from [validate]{@link JSV.validate}
         */
        showValResult: function(result) {
            var cont = $('#validation-results'), ui;

            if(cont.children().length) {
                cont.css('opacity', 0);
            }

            if(result.valid) {
                cont.html('<p class=ui-content>JSON is valid!</p>');
            } else {
                ui = cont.html('<div class=ui-content>JSON is <b>NOT</b> valid!</div>');
                $.each(result.errors, function(i, err){
                    var me = JSV.buildValError(err, 'Error ' + (i+1) + ': ');

                    if(err.subErrors) {
                        $.each(err.subErrors, function(i, sub){
                            me.append(JSV.buildValError(sub, 'SubError ' + (i+1) + ': '));
                        });
                    }

                    ui.children('.ui-content').first().append(me).enhanceWithin();
                });
            }

            cont.toggleClass('error', !result.valid);
            $('#validator-page').animate({
                scrollTop: $('#validation-results').offset().top + 20
            }, 1000);

            cont.fadeTo(700, 1);
        },

        /**
         * Build a collapsible validation block.
         *
         * @param {object} err The error object
         * @param {string} title The title for the error block
         */
        buildValError: function(err, title) {
            var main = '<div data-role="collapsible" data-collapsed="true" data-mini="true">' +
                            '<h4>' + (title || 'Error: ') + err.message + '</h4>' +
                            '<ul><li>Message: '+ err.message + '</li>' +
                            '<li>Data Path: '+ err.dataPath + '</li>' +
                            '<li>Schema Path: '+ err.schemaPath + '</li></ul></div>';

           return $(main);
        },

        /**
         * Set the content for the info panel.
         *
         * @param {object} node The d3 tree node.
         */
        setInfo: function(node) {
            var schema = $('#info-tab-schema');
            var def = $('#info-tab-def');
            var ex = $('#info-tab-example');

            var height = ($('#info-panel').innerHeight() - $('#info-panel .ui-panel-inner').outerHeight() + $('#info-panel #info-tabs').height()) -
                $('#info-panel #info-tabs-navbar').height() - (schema.outerHeight(true) - schema.height());

            $.each([schema, def, ex], function(i, e){
                e.height(height);
            });

            $('#info-definition').html(node.description || 'No definition provided.');
            $('#info-type').html(node.displayType.toString());

            if(node.translation) {
                var trans = $('<ul></ul>');

                $.each(node.translation, function(p, v) {
                    var li = $('<li>' + p + '</li>');
                    var ul = $('<ul></ul>');

                    $.each(v, function(i, e) {
                       ul.append('<li>' + e + '</li>');
                    });

                    trans.append(li.append(ul));
                });

                $('#info-translation').html(trans);
            } else {
                $('#info-translation').html('No translations available.');
            }


            JSV.createPre(schema, tv4.getSchema(node.schema), false, node.plainName);

            var example = (!node.example && node.parent && node.parent.example && node.parent.type === 'object' ? node.parent.example : node.example);

            if(example) {
                if(example !== JSV.example) {
                    $.getJSON(node.schema.match( /^(.*?)(?=[^\/]*\.json)/g ) + example, function(data) {
                        var pointer = example.split('#')[1];

                        if(pointer) {
                            data = jsonpointer.get(data, pointer);
                        }

                        JSV.createPre(ex, data, false, node.plainName);
                        JSV.example = example;
                    }).fail(function() {
                        ex.html('<h3>No example found.</h3>');
                        JSV.example = false;
                    });
                } else {
                    var pre = ex.find('pre'),
                        highEl;

                    pre.find('span.highlight').removeClass('highlight');

                    if(node.plainName) {
                        pre.highlight(node.plainName, 'highlight', true);
                    }
                    //scroll to highlighted property
                    highEl = pre.find('span.highlight')[0];

                    if (highEl) {
                        pre.scrollTo(highEl, 900);
                    }
                }
            } else {
                ex.html('<h3>No example available.</h3>');
                JSV.example = false;
            }
        },

        /**
         * Create a *pre* block and append it to the passed element.
         *
         * @param {object} el jQuery element
         * @param {object} obj The obj to stringify and display
         * @param {string} title The title for the new window
         * @param {string} exp The string to highlight
         */
        createPre: function(el, obj, title, exp) {
            var pre = $('<pre><code class="language-json">' + JSON.stringify(obj, null, '  ') + '</code></pre>');
            var btn = $('<a href="#" class="ui-btn ui-mini ui-icon-action ui-btn-icon-right">Open in new window</a>').click(function() {
                var w = window.open('', 'pre', null, true);

                $(w.document.body).html($('<div>').append(pre.clone().height('95%')).html());
                hljs.highlightBlock($(w.document.body).children('pre')[0]);
                $(w.document.body).append('<link rel="stylesheet" href="http://cdnjs.cloudflare.com/ajax/libs/highlight.js/8.1/styles/default.min.css">');
                w.document.title = title || 'JSON Schema Viewer';
                w.document.close();
            });

            el.html(btn);

            if(exp) {
                pre.highlight(exp, 'highlight', true);
            }
            el.append(pre);
            pre.height(el.height() - btn.outerHeight(true) - (pre.outerHeight(true) - pre.height()));

            //scroll to highlighted property
            var highEl = pre.find('span.highlight')[0];

            if(highEl) {
                pre.scrollTo(highEl, 900);
            }
        },

        /**
         * Create a "breadcrumb" for the node.
         */
        compilePath: function(node, path) {
            var p;

            if(node.parent) {
                p = path ? node.name + ' > ' + path : node.name;
                return JSV.compilePath(node.parent, p);
            } else {
                p = path ? node.name + ' > ' + path : node.name;
            }

            return p;
        },

        /**
         * Load an example in the specified input field.
         */
        loadInputExample: function(uri, target) {
            $.getJSON(uri).done(function(fetched) {
                $('#' + target).val(JSON.stringify(fetched, null, '  '));
            }).fail(function(jqXHR, textStatus, errorThrown) {
                JSV.showError('Failed to load example: ' + errorThrown);
            });
        },

        /**
         * Create a "permalink" for the node.
         */
        setPermalink: function(node) {
            var uri = new URI(),
                path = JSV.getNodePath(node).join('-');

            //uri.search({ v: path});
            uri.hash($.mobile.activePage.attr('id') + '?v=' + path);
            $('#permalink').html(JSV.compilePath(node));
            $('#sharelink').val(uri.toString());
        },

        /**
         * Create an index-based path for the node from the root.
         */
        getNodePath: function(node, path) {
            var p = path || [],
                parent = node.parent;

            if(parent) {
                var children = parent.children || parent._children;

                p.unshift(children.indexOf(node));
                return JSV.getNodePath(parent, p);
            } else {
                return p;
            }
        },

        /**
         * Expand an index-based path for the node from the root.
         */
        expandNodePath: function(path) {
            var i,
                node = JSV.treeData; //start with root

            for (i = 0; i < path.length; i++) {
                if(node._children) {
                    JSV.expand(node);
                }
                node = node.children[path[i]];
            }

            JSV.update(JSV.treeData);
            JSV.centerNode(node);

            return node;
        },
        _expandAll: function(d) {
            if (!d) return;
            if (d._children) JSV.expand(d);
            var kids = d.children || [];
            for (var i = 0; i < kids.length; i++) {
                JSV._expandAll(kids[i]);
            }
        },
        expandToForms: function(formValue) {
            var targets = JSV._normalizeFormTargets(formValue);
            var found = [];
            var lastNode = null;
            var i, j, node, touched = false;
            var pathTargets = [], nameTargets = [];
            for (i = 0; i < targets.length; i++) {
                var t = targets[i];
                if (!t) continue;
                if (t.charAt(0) === '/' || t.indexOf('.') !== -1 || /[\[\]]/.test(t)) {
                    pathTargets.push(t);
                } else {
                    nameTargets.push(t);
                }
            }

            function pushUnique(n) {
                if (!n) return;
                for (var k = 0; k < found.length; k++) if (found[k] === n) return;
                found.push(n);
            }
            for (i = 0; i < pathTargets.length; i++) {
                var segs = JSV._segmentsFromTarget(pathTargets[i]);
                node = JSV._expandPathFromRootNoCenter(segs);
                if (node) { pushUnique(node); lastNode = node; touched = true; }
            }
            for (i = 0; i < nameTargets.length; i++) {
                var hits = JSV._searchNodesByName(nameTargets[i]);
                for (j = 0; j < hits.length; j++) {
                    var path = JSV.getNodePath(hits[j]);
                    node = JSV._expandIndexPathNoCenter(path);
                    if (node) { pushUnique(node); lastNode = node; touched = true; }
                }
            }

            if (touched) {
                for (i = 0; i < found.length; i++) {
                    JSV._expandAll(found[i]);
                }
                JSV.update(JSV.treeData);
                var centerTarget = found[found.length - 1] || lastNode;
                if (centerTarget) JSV.centerNode(centerTarget);

                var hasFlash = typeof JSV.flashNode === 'function';
                for (i = 0; i < found.length; i++) {
                    (function(n, delay){
                        setTimeout(function(){
                            if (hasFlash) {
                                JSV.flashNode(n);
                            } else {
                                d3.select('#n-' + n.id).classed('form-hit', true);
                                setTimeout(function(){
                                    d3.select('#n-' + n.id).classed('form-hit', false);
                                }, 7000);
                            }
                        }, delay);
                    })(found[i], i * 180);
                }
            }

            return lastNode;
        },

         _normalizeFormTargets: function(form) {
            var out = [];
            if (form == null) return out;

            if (typeof form === 'string') {
                form.split(/[\n,;]+/).forEach(function(s){
                    s = (s || '').trim();
                    if (s) out.push(s);
                });
            } else if (Object.prototype.toString.call(form) === '[object Array]') {
                out = form.slice(0);
            } else if (typeof form === 'object') {
                if (Array.isArray(form.paths)) out = form.paths.slice(0);
                else if (typeof form.path === 'string') out = [form.path];
                else if (typeof form.target === 'string') out = [form.target];
            }
            return out;
        },
        _segmentsFromTarget: function(t) {
            if (!t) return [];
            if (t.charAt(0) === '/') {
                return t.split('/').filter(Boolean).map(function(s){
                    return s.replace(/~1/g, '/').replace(/~0/g, '~');
                });
            }
            var cleaned = String(t).replace(/\[(.*?)\]/g, function(_, g1){
                if (g1 === '' || /^[0-9]+$/.test(g1)) return '.item';
                return '.' + g1;
            });
            return cleaned.split('.').filter(function(s){ return s.length; });
        },
        _expandPathFromRootNoCenter: function(segments) {
            var node = JSV.treeData;
            for (var i = 0; i < segments.length; i++) {
                if (!node) return null;
                if (node._children) JSV.expand(node);
                var next = JSV._findChildByPlainName(node, segments[i]);
                if (!next) return null;
                node = next;
            }
            return node;
        },

        _expandIndexPathNoCenter: function(path) {
            var node = JSV.treeData;
            for (var i = 0; i < path.length; i++) {
                if (!node) return null;
                if (node._children) JSV.expand(node);
                var kids = node.children || [];
                node = kids[path[i]];
            }
            return node;
        },
        _searchNodesByName: function(name) {
            var res = [];
            var target = String(name).trim();
            if (!target) return res;

            JSV.visit(JSV.treeData, function(n){
                if (!n) return;
                var plain = n.plainName;
                var disp  = (n.name || '')
                              .replace(/\{ \}/, '')
                              .replace(/:.*/, '')
                              .replace(/\[.*\]/, '');
                if (plain === target || disp === target) res.push(n);
            }, function(n){ return (n && (n.children || n._children)) || null; });

            return res;
        },
        _findChildByPlainName: function(node, seg) {
            var kids = (node.children || node._children) || [];
            for (var i = 0; i < kids.length; i++) {
                if (kids[i].plainName === seg) return kids[i];
            }
            for (i = 0; i < kids.length; i++) {
                var nm = kids[i].name || '';
                nm = nm.replace(/\{ \}/, '').replace(/:.*/, '').replace(/\[.*\]/, '');
                if (nm === seg) return kids[i];
            }
            return null;
        },

        /**
         * Build Search.
         */
        buildSearchList: function(items, init) {
            var ul = $('ul#search-result');

            $.each(items, function(i,v) {
                var data = v.split('|');
                var li = $('<li/>').attr('data-icon', 'false').appendTo(ul);

                $('<a/>').attr('data-path', data[1]).text(data[0]).appendTo(li);
            });

            if(init) {
              ul.filterable();
            }
            ul.filterable('refresh');

            ul.on('click', function(e) {
                var path = $(e.target).attr('data-path');
                var node = JSV.expandNodePath(path.split('-'));

                JSV.flashNode(node);
            });

        },

        /**
         * Flash node text
         */
        flashNode: function(node, totalMs) {
            var STEP = 350;                          // один fadeTo
            var TOTAL = typeof totalMs === 'number' ? totalMs : 7000;
            var cycles = Math.max(1, Math.round(TOTAL / (STEP * 2)));

            var $text = $('#n-' + node.id + ' text');
            // сбросим возможные прошлые анимации, чтобы не накапливать очередь
            $text.stop(true, true);

            for (var i = 0; i < cycles; i++) {
                $text.fadeTo(STEP, 0).fadeTo(STEP, 1);
            }
        },

        /**
         * A recursive helper function for performing some setup by walking
         * through all nodes
         */
        visit: function (parent, visitFn, childrenFn) {
            if (!parent) {
                return;
            }
            visitFn(parent);

            var children = childrenFn(parent);

            if (children) {
                var count = children.length, i;
                for ( i = 0; i < count; i++) {
                    JSV.visit(children[i], visitFn, childrenFn);
                }
            }
        },

        /**
         * Create the tree data object from the schema(s)
         */
        compileData: function (schema, parent, name, real, depth) {
            // Ensure healthy amount of recursion
            depth = depth || 0;
            if (depth > this.maxDepth) {
                return;
            }
            var key, node,
                s = schema.$ref ? tv4.getSchema(schema.$ref) : schema,
                props = s.properties,
                items = s.items,
                owns = Object.prototype.hasOwnProperty,
                all = {},
                parentSchema = function(node) {
                    var schema = node.id || node.$ref || node.schema;

                    if (schema) {
                        return schema;
                    } else if (node.parentSchema) {
                        return parentSchema(node.parentSchema);
                    } else {
                        return null;
                    }
                };

            if (s.allOf) {
                all.allOf = s.allOf;
            }

            if (s.oneOf) {
                all.oneOf = s.oneOf;
            }

            if (s.anyOf) {
                all.anyOf = s.anyOf;
            }
            
            console.log(s);
            if (s && s.type === 'array') {
                var childName = (s.title || name || 'item');
                var inheritedForm = schema.form || s.form;

                if (items && Object.prototype.toString.call(items) === '[object Object]') {
                    if (inheritedForm != null && items.form == null) items.form = inheritedForm;
                    JSV.compileData(items, parent, childName, /*real=*/false, depth + 1);
                } else if (Array.isArray(items)) {
                    items.forEach(function (itm, idx) {
                    if (itm && inheritedForm != null && itm.form == null) itm.form = inheritedForm;
                    JSV.compileData(itm, parent, childName + '[' + idx + ']', /*real=*/false, depth + 1);
                    });
                }
                return;
                }
            node = {
                description: schema.description || s.description,
                name: (schema.$ref && real ? name : false) || s.title || name || 'schema',
                isReal: real,
                plainName: name,
                type: s.type,
                displayType: s.type || (s['enum'] ? 'enum: ' + s['enum'].join(', ') : s.items ? 'array' : s.properties ? 'object' : 'ambiguous'),
                translation: schema.translation || s.translation,
                example: schema.example || s.example,
                opacity: real ? 1 : 0.5,
                required: s.required,
                schema: s.id || schema.$ref || parentSchema(parent),
                parentSchema: parent,
                deprecated: schema.deprecated || s.deprecated,
                form: schema.form || s.form
            };

            node.require = parent && parent.required ? parent.required.indexOf(node.name) > -1 : false;

            if (parent) {
                if (node.name === 'item') {
                    node.parent = parent;
                    if(node.type) {
                        node.name = node.type;
                        parent.children.push(node);
                    }
                } else if (parent.name === 'item') {
                    parent.parent.children.push(node);
                } else {
                    parent.children.push(node);
                }
            } else {
                JSV.treeData = node;
            }

            if(props || items || all) {
                node.children = [];
            }

            for (key in props) {
                if (!owns.call(props, key)) {
                    continue;
                }
                JSV.compileData(props[key],  node, key, true, depth + 1);
            }

            for (key in all) {
                if (!owns.call(all, key)) {
                    continue;
                }
                if (!all[key]) {
                    continue;
                }
                var allNode = {
                    name: key,
                    children: [],
                    opacity: 0.5,
                    parentSchema: parent,
                    schema: schema.$ref || parentSchema(parent)
                };

                if (node.name === 'item') {
                    node.parent.children.push(allNode);
                } else {
                    node.children.push(allNode);
                }

                for (var i = 0; i < all[key].length; i++) {
                    JSV.compileData(all[key][i], allNode, s.title || all[key][i].type, false, depth + 1);
                }
            }

            if (Object.prototype.toString.call(items) === '[object Object]') {
                JSV.compileData(items, node, 'item', false, depth + 1);
            } else if (Object.prototype.toString.call(items) === '[object Array]') {

                items.forEach(function(itm, idx, arr) {
                    JSV.compileData(itm, node, idx.toString(), false, depth + 1);
                });
            }

        },

        /**
         * Resize the diagram
         */
        resizeViewer: function() {
            JSV.viewerWidth = $('#main-body').width();
            JSV.viewerHeight = $('#main-body').height();
            if(JSV.focusNode) {
                JSV.centerNode(JSV.focusNode);
            }
        },

        /**
         * Reset the tree starting from the passed source.
         */
        resetTree: function (source, level) {
            JSV.visit(source, function(d) {
                if (d.children && d.children.length > 0 && d.depth > level && !JSV.labels[d.name]) {
                    JSV.collapse(d);
                    //d._children = d.children;
                    //d.children = null;
                }else if(JSV.labels[d.name]){
                    JSV.expand(d);
                }
            }, function(d) {
                if (d.children && d.children.length > 0) {
                    return d.children;
                } else if (d._children && d._children.length > 0) {
                    return d._children;
                } else {
                    return null;
                }
            });
        },

        /**
         * Reset and center the tree.
         */
        resetViewer: function () {
            //Firefox will choke if the viewer-page is not visible
            //TODO: fix on refactor to use pagecontainer event
            var page = $('#viewer-page');

            page.css('display','block');

            // Define the root
            var root = JSV.treeData;
            root.x0 = JSV.viewerHeight / 2;
            root.y0 = 0;

            // Layout the tree initially and center on the root node.
            // Call visit function to set initial depth
            JSV.tree.nodes(root);
            JSV.resetTree(root, 1);
            JSV.update(root);

            //reset the style for viewer-page
            page.css('display', '');

            JSV.centerNode(root, 4);
        },

        /**
         * Function to center node when clicked so node doesn't get lost when collapsing with large amount of children.
         */
        centerNode: function (source, ratioX) {
            var rX = ratioX ? ratioX : 2,
                zl = JSV.zoomListener,
                scale = zl.scale(),
                x = -source.y0 * scale + JSV.viewerWidth / rX,
                y = -source.x0 * scale + JSV.viewerHeight / 2;

            d3.select('g#node-group').transition()
                .duration(JSV.duration)
                .attr('transform', 'translate(' + x + ',' + y + ')scale(' + scale + ')');
            zl.scale(scale);
            zl.translate([x, y]);
        },

        /**
         * Helper functions for collapsing nodes.
         */
        collapse: function (d) {
            if (d.children) {
                d._children = d.children;
                //d._children.forEach(collapse);
                d.children = null;
            }
        },

        /**
         * Helper functions for expanding nodes.
         */
        expand: function (d) {
            if (d._children) {
                d.children = d._children;
                //d.children.forEach(expand);
                d._children = null;
            }

            if (d.children) {
                var count = d.children.length, i;
                for (i = 0; i < count; i++) {
                    if(JSV.labels[d.children[i].name]) {
                        JSV.expand(d.children[i]);
                    }
                }
            }
        },

        /**
         * Toggle children function
         */
        toggleChildren: function (d) {
            if (d.children) {
                JSV.collapse(d);
            } else if (d._children) {
                JSV.expand(d);
            }
            return d;
        },

        /**
         * Toggle children on node click.
         */
        click: function (d) {
            if(!JSV.labels[d.name]) {
                console.log("clicked", d);
                if (d3.event && d3.event.defaultPrevented) {return;} // click suppressed
                d = JSV.toggleChildren(d);
                JSV.update(d);
                JSV.centerNode(d);
            }
        },

        /**
         * Show info on node title click.
         */
       clickTitle: function (d) {
            if(!JSV.labels[d.name]) {
                if (d3.event && d3.event.defaultPrevented) {return;} // click suppressed
                var panel = $( '#info-panel' );
                if (d && d.form != null && d.form !== '') {
                    var target = JSV.expandToForms(d.form);
                    if (target) { d = target; }
                }

                if(JSV.focusNode) {
                    d3.select('#n-' + JSV.focusNode.id).classed('focus',false);
                }
                JSV.focusNode = d;
                JSV.centerNode(d);
                d3.select('#n-' + d.id).classed('focus',true);

                if(!JSV.plain) {
                  JSV.setPermalink(d);

                  $('#info-title')
                    .text('Info: ' + d.name)
                    .toggleClass('deprecated', !!d.deprecated);
                  JSV.setInfo(d);
                  panel.panel( 'open' );
                }
            }
        },

        /**
         * Zoom the tree
         */
        zoom: function () {
            JSV.svgGroup.attr('transform', 'translate(' + JSV.zoomListener.translate() + ')' + 'scale(' + JSV.zoomListener.scale() + ')');
        },

        /**
         * Perform the d3 zoom based on position and scale
         */
        interpolateZoom: function  (translate, scale) {
            return d3.transition().duration(350).tween('zoom', function () {
                var iTranslate = d3.interpolate(JSV.zoomListener.translate(), translate),
                    iScale = d3.interpolate(JSV.zoomListener.scale(), scale);
                return function (t) {
                    JSV.zoomListener
                        .scale(iScale(t))
                        .translate(iTranslate(t));
                    JSV.zoom();
                };
            });
        },

        /**
         * Click handler for the zoom control
         */
        zoomClick: function () {
            var clicked = d3.event.target,
                direction = 1,
                factor = 0.2,
                target_zoom = 1,
                center = [JSV.viewerWidth / 2, JSV.viewerHeight / 2],
                zl = JSV.zoomListener,
                extent = zl.scaleExtent(),
                translate = zl.translate(),
                translate0 = [],
                l = [],
                view = {x: translate[0], y: translate[1], k: zl.scale()};

            d3.event.preventDefault();
            direction = (this.id === 'zoom_in') ? 1 : -1;
            target_zoom = zl.scale() * (1 + factor * direction);

            if (target_zoom < extent[0] || target_zoom > extent[1]) { return false; }

            translate0 = [(center[0] - view.x) / view.k, (center[1] - view.y) / view.k];
            view.k = target_zoom;
            l = [translate0[0] * view.k + view.x, translate0[1] * view.k + view.y];

            view.x += center[0] - l[0];
            view.y += center[1] - l[1];

            JSV.interpolateZoom([view.x, view.y], view.k);
        },

        /**
         * The zoomListener which calls the zoom function on the 'zoom' event constrained within the scaleExtents
         */
        zoomListener: null,

        /**
         * Sort the tree according to the node names
         */
        sortTree: function (tree) {
            tree.sort(function(a, b) {
                return b.name.toLowerCase() < a.name.toLowerCase() ? 1 : -1;
            });
        },

        /**
         * The d3 diagonal projection for use by the node paths.
         */
        diagonal1: d3.svg.diagonal().projection(function(d) { return [d.y, d.x]; })
        /*function(d) {
            var src = d.source,
                node = d3.select('#n-' + (src.id))[0][0],
                dia,
                width = 0 ;

            if(node) {
                width = node.getBBox().width;
            }

            dia = 'M' + (src.y + width) + ',' + src.x +
                'H' + (d.target.y - 30) + 'V' + d.target.x +
                //+ (d.target.children ? '' : 'h' + 30);
                ('h' + 30);

           return dia;
        }*/,
         TEXT_LEFT_X: 30,
        RIGHT_PAD: 16,      
        COLUMN_GAP: 24,      

        measureTextEl: null,
        measureText: function (s) {
            if (!JSV.baseSvg) return String(s || '').length * 7;
            var needNew = false;
            if (!JSV.measureTextEl) {
                needNew = true;
            } else {
                var n = JSV.measureTextEl.node && JSV.measureTextEl.node();
                if (!n || !document.documentElement.contains(n) ||
                    (n.ownerSVGElement !== (JSV.baseSvg && JSV.baseSvg.node && JSV.baseSvg.node()))) {
                    needNew = true;
                }
            }
            if (needNew) {
                JSV.measureTextEl = JSV.baseSvg.append('text')
                    .attr('class', 'node-text')
                    .attr('visibility', 'hidden')
                    .attr('x', -9999).attr('y', -9999);
            }
            JSV.measureTextEl.text(String(s || ''));
            var node = JSV.measureTextEl.node();
            return node && node.getComputedTextLength ? node.getComputedTextLength()
                                                    : String(s || '').length * 7;
        },
        DB_PATH:     ['КИВЦ 1978', 'Входные документы'],
        FORMS_PATH:  ['КИВЦ 1978', 'Входные документы', 'Формы без явного определения'],

        _normName: function (s) {
          return String(s || '')
            .toLowerCase()
            .replace(/[_\s]+/g, ' ')
            .replace(/[{}[\]:]/g, '')
            .trim();
        },

        _normTargetsReady: false,
        _DB_N: null,
        _FORMS_N: null,
        _ensureNormTargets: function () {
          if (!JSV._normTargetsReady) {
            JSV._DB_N    = JSV.DB_PATH.map(JSV._normName);
            JSV._FORMS_N = JSV.FORMS_PATH.map(JSV._normName);
            JSV._normTargetsReady = true;
          }
        },

        _pathOf: function (d) {
          var p = [], cur = d;
          while (cur) { p.unshift(JSV._normName(cur.name)); cur = cur.parent; }
          return p;
        },

        _pathEq: function (a, b) {
          if (!a || !b || a.length !== b.length) return false;
          for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
          return true;
        },

        _parentPathEq: function (d, target) {
          if (!d || !d.parent) return false;
          var p = JSV._pathOf(d.parent);
          return JSV._pathEq(p, target);
        },

        _childCount: function (d) {
          var kids = (d.children || d._children) || [];
          return kids.length;
        },

        getDisplayName: function (d) {
          JSV._ensureNormTargets();
          var base = d.name || '';
          if (JSV._pathEq(JSV._pathOf(d), JSV._FORMS_N)) {
            var nF = JSV._childCount(d);
            return nF ? (base + '(' + nF + ')') : base;
          }
          if (JSV._parentPathEq(d, JSV._DB_N)) {
            var nD = JSV._childCount(d);
            return nD ? (base + '(' + nD + ')') : base;
          }

          return base;
        },
        termDict: [
        {
            "canonical":"Год месяц",
            "variants":[
            "заводнения месяц, год",
            "открытия месяц, год",
            "разработку месяц, год",
            "бурения месяц, год",
            "эксплуатации месяц, год"
            ],
            "n_variants":5
        },
        {
            "canonical":"Добыто нефти с начала разработки, т",
            "variants":[
            "нефти С начала разработки, т.т.",
            "нефти С начала разработки т.т.",
            "С начала разработки, т.т.",
            "С начала разработки т.т.",
            "т.м³ С начала разработки"
            ],
            "n_variants":5
        },
        {
            "canonical":"Диаметр, мм",
            "variants":[
            "Диаметр, мм",
            "диаметр, мм",
            "колонна диаметр ,мм",
            "Кондуктор диаметр ,мм"
            ],
            "n_variants":4
        },
        {
            "canonical":"Код пласта",
            "variants":[
            "Код пласта",
            "Пласт код",
            "Код горизонта и пласта",
            "Код горизонта или пласта"
            ],
            "n_variants":4
        },
        {
            "canonical":"Время работы",
            "variants":[
            "Время работы, часы, мин",
            "работы час",
            "Время час, мин"
            ],
            "n_variants":3
        },
        {
            "canonical":"Горизонт",
            "variants":[
            "ГОРИЗОНТ",
            "Горизонт",
            "Горизонт, ярус,"
            ],
            "n_variants":3
        },
        {
            "canonical":"Плотность",
            "variants":[
            "Плотность Пластов",
            "Плотность перворац.",
            "Плотность Поверхност."
            ],
            "n_variants":3
        },
        {
            "canonical":"Абс. отметка ВНК текущ., м",
            "variants":[
            "Абс. отметка текущ. ВНК, м.",
            "Абс. отметка текущего положения ВНК, м."
            ],
            "n_variants":2
        },
        {
            "canonical":"Верх колонны-летучки",
            "variants":[
            "Верх колонны летучки, м",
            "Матер. колонны летучки"
            ],
            "n_variants":2
        },
        {
            "canonical":"Гидропроводность, д.см\/СП",
            "variants":[
            "Гидропроводность д.см\/СП",
            "Гидропроводность пласта, дсм\/сп."
            ],
            "n_variants":2
        },
        {
            "canonical":"Глубина замера",
            "variants":[
            "Глубина замера, м",
            "Глубина замера,м"
            ],
            "n_variants":2
        },
        {
            "canonical":"Глубина подошвы, м",
            "variants":[
            "Глубина подошвы, м",
            "Глубина подошвы,м"
            ],
            "n_variants":2
        },
        {
            "canonical":"Год, месяц",
            "variants":[
            "воды, месяц, год",
            "ремонта год, месяц, число"
            ],
            "n_variants":2
        },
        {
            "canonical":"Давление насыщения",
            "variants":[
            "Давление насыщения",
            "Давление насыщения, т."
            ],
            "n_variants":2
        },
        {
            "canonical":"Дата начала",
            "variants":[
            "Дата начала",
            "Дата начала ."
            ],
            "n_variants":2
        },
        {
            "canonical":"Дата начала эксплуатации",
            "variants":[
            "Дата начала эксплуатации",
            "Дата начала эксплуат."
            ],
            "n_variants":2
        },
        {
            "canonical":"Дата окончания ремонта (проведения ГТМ) год, месяц, число",
            "variants":[
            "Дата окончания проведения ГТМ, год, месяц, число",
            "Дата проведения ГТМ, год, месяц, число"
            ],
            "n_variants":2
        },
        {
            "canonical":"Дебит жидкости",
            "variants":[
            "Дебит жидкости, т\/сут",
            "Дебит жидкости из гор. м³"
            ],
            "n_variants":2
        },
        {
            "canonical":"Интервалы перфор. до",
            "variants":[
            "перфор. до",
            "Интервалы"
            ],
            "n_variants":2
        },
        {
            "canonical":"Исследователь",
            "variants":[
            "Исследователь",
            "Исследователь."
            ],
            "n_variants":2
        },
        {
            "canonical":"Карбонатность",
            "variants":[
            "Карбонатность, %",
            "Карбонатность пласта, %"
            ],
            "n_variants":2
        },
        {
            "canonical":"Категория",
            "variants":[
            "Категория",
            "Дебет Категория"
            ],
            "n_variants":2
        },
        {
            "canonical":"Пласт",
            "variants":[
            "ПЛАСТ",
            "% Обв. пласта"
            ],
            "n_variants":2
        },
        {
            "canonical":"Плотность воды",
            "variants":[
            "Плотность воды, г\/см³",
            "Плотность воды гор. г\/см³"
            ],
            "n_variants":2
        },
        {
            "canonical":"Плотность перфорации, отв\/м",
            "variants":[
            "Плотность перфорации, отв\/м",
            "Плотность перфорации,отв.\/п.м."
            ],
            "n_variants":2
        },
        {
            "canonical":"Пористость",
            "variants":[
            "Пористость, %",
            "Пористость пласта, %"
            ],
            "n_variants":2
        },
        {
            "canonical":"Признак изменения пласта",
            "variants":[
            "Признак изменения пласта",
            "Признка изменения пласта"
            ],
            "n_variants":2
        },
        {
            "canonical":"Проницаемость",
            "variants":[
            "Проницаемость, мд",
            "Проницаемость пласта, мд."
            ],
            "n_variants":2
        },
        {
            "canonical":"Разряд рабочего",
            "variants":[
            "Разряд рабочего",
            "Разряд"
            ],
            "n_variants":2
        },
        {
            "canonical":"Содержание серы",
            "variants":[
            "Содержание в",
            "Содержание"
            ],
            "n_variants":2
        },
        {
            "canonical":"Тип коллек.",
            "variants":[
            "Тип коллек",
            "Тип коллек."
            ],
            "n_variants":2
        },
        {
            "canonical":"Толщина стенки",
            "variants":[
            "Толщина стенки, мм",
            "толщина стенки, мм"
            ],
            "n_variants":2
        },
        {
            "canonical":"Фонд скважин нагнетательный",
            "variants":[
            "Фонд нагнетательных",
            "По нагнетательным скважинам"
            ],
            "n_variants":2
        },
        {
            "canonical":"Эффективная мощность пласта",
            "variants":[
            "Эффективная мощность пласта, м.",
            "Эффективная нефтенас. мощность пласта, м."
            ],
            "n_variants":2
        },
        {
            "canonical":"% распредел. в пласт",
            "variants":[
            "% Распредел. в пласт"
            ],
            "n_variants":1
        },
        {
            "canonical":"% распределения в гор.",
            "variants":[
            "% Распределения в гор."
            ],
            "n_variants":1
        },
        {
            "canonical":"Абс. отметка первонач. ВНК, м",
            "variants":[
            "Абс. отметка первонач. ВНК, м."
            ],
            "n_variants":1
        },
        {
            "canonical":"Азимут отклонения",
            "variants":[
            "Азимут отклонения, град"
            ],
            "n_variants":1
        },
        {
            "canonical":"Альтитуда муфты",
            "variants":[
            "Альтитуда муфты, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Альтитуда муфты после ремонта",
            "variants":[
            "После ремонта"
            ],
            "n_variants":1
        },
        {
            "canonical":"Альтитуда от стола ротора",
            "variants":[
            "Альтитуда от ствола ротора, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Альтитуда фланца",
            "variants":[
            "Альтитуда фланца, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Блок",
            "variants":[
            "Блок"
            ],
            "n_variants":1
        },
        {
            "canonical":"Вид агента",
            "variants":[
            "Вид агента"
            ],
            "n_variants":1
        },
        {
            "canonical":"Вид добываемой воды",
            "variants":[
            "Вид добыв. воды"
            ],
            "n_variants":1
        },
        {
            "canonical":"Вид заводнения",
            "variants":[
            "Вид заводнения"
            ],
            "n_variants":1
        },
        {
            "canonical":"Вид защиты наружной поверхности",
            "variants":[
            "Вид защиты поверхности от коррозии:"
            ],
            "n_variants":1
        },
        {
            "canonical":"Вид проводимых работ",
            "variants":[
            "Вид провод. работ"
            ],
            "n_variants":1
        },
        {
            "canonical":"Вид работы",
            "variants":[
            "Вид работы"
            ],
            "n_variants":1
        },
        {
            "canonical":"Вид реагента",
            "variants":[
            "Вид реагента"
            ],
            "n_variants":1
        },
        {
            "canonical":"Водон. мощн., м",
            "variants":[
            "Водон, мощн., м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Водонасыщенная мощность",
            "variants":[
            "Водонасыщенная мощность пласта, м."
            ],
            "n_variants":1
        },
        {
            "canonical":"Водоотдача",
            "variants":[
            "Водоотдача"
            ],
            "n_variants":1
        },
        {
            "canonical":"Воды за период",
            "variants":[
            "воды За период, т.м³"
            ],
            "n_variants":1
        },
        {
            "canonical":"Время простоя за месяц",
            "variants":[
            "Время простоя, час, мин."
            ],
            "n_variants":1
        },
        {
            "canonical":"Высота подъема цем. кольца за колонной, м",
            "variants":[
            "Высота подъёма цем. кольца за колонной, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Высота подъема цементного кольца, м",
            "variants":[
            "Высота подёма цементного кольца, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Выход светлых фракций, до 100°C",
            "variants":[
            "Выход светлых фракций,"
            ],
            "n_variants":1
        },
        {
            "canonical":"Газовый фактор",
            "variants":[
            "Газовый фактор м³\/т"
            ],
            "n_variants":1
        },
        {
            "canonical":"Гидропроводность",
            "variants":[
            "Гидропроводность"
            ],
            "n_variants":1
        },
        {
            "canonical":"Гидропроводность призабойной зоны",
            "variants":[
            "Электропрогрев призабойной зоны"
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина залегания кровли пласта",
            "variants":[
            "Глубина залегания кровли пласта, м."
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина залегания подошвы пласта",
            "variants":[
            "Глубина залегания подошвы пласта, м."
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина кровли, м",
            "variants":[
            "Глубина кровли,м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина расположения кривизны",
            "variants":[
            "Глубина расположения кривизны, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина скважины, которую нельзя очистить",
            "variants":[
            "Глубина скважины, ниже которой нельзя очистить, м."
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина снижения уровня",
            "variants":[
            "Глубина снижения уровня, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина спуска",
            "variants":[
            "Глубина спуска, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Глубина укладки трубопровода, см",
            "variants":[
            "глубина укладки, см"
            ],
            "n_variants":1
        },
        {
            "canonical":"Давление на устье скважин",
            "variants":[
            "Давление на устье"
            ],
            "n_variants":1
        },
        {
            "canonical":"Давление опресс. э\/колонны, кг\/см3",
            "variants":[
            "Давление опресс. э\/колонны, кг\/см²"
            ],
            "n_variants":1
        },
        {
            "canonical":"Дата",
            "variants":[
            "Дата"
            ],
            "n_variants":1
        },
        {
            "canonical":"Дата (год, месяц)",
            "variants":[
            "Дата замера, месяц, число, год"
            ],
            "n_variants":1
        },
        {
            "canonical":"Дата ввода в эксплуатацию",
            "variants":[
            "Дата ввода в"
            ],
            "n_variants":1
        },
        {
            "canonical":"Дата нанесения покрытия",
            "variants":[
            "Дата нанения покрытия"
            ],
            "n_variants":1
        },
        {
            "canonical":"Дата начала закачки агента",
            "variants":[
            "Дата начала закачки агента"
            ],
            "n_variants":1
        },
        {
            "canonical":"Дата начала применения ингибитора",
            "variants":[
            "Дата начала применения"
            ],
            "n_variants":1
        },
        {
            "canonical":"Дебит нефти, т\/сут",
            "variants":[
            "Дебит нефти"
            ],
            "n_variants":1
        },
        {
            "canonical":"Диаметр пробуренного ствола, мм",
            "variants":[
            "Диаметр пробуренного ствола, мм"
            ],
            "n_variants":1
        },
        {
            "canonical":"Диаметр шаблона",
            "variants":[
            "Диаметр шаблона, мм"
            ],
            "n_variants":1
        },
        {
            "canonical":"Диаметр штуцера",
            "variants":[
            "Диаметр штуцера, мм"
            ],
            "n_variants":1
        },
        {
            "canonical":"Добыча воды за год",
            "variants":[
            "Добыча воды(За год, т.т."
            ],
            "n_variants":1
        },
        {
            "canonical":"Добыча воды за период",
            "variants":[
            "Добыча воды(За период т.т."
            ],
            "n_variants":1
        },
        {
            "canonical":"Добыча воды, м3",
            "variants":[
            "Добыча воды м³"
            ],
            "n_variants":1
        },
        {
            "canonical":"Добыча газа за период",
            "variants":[
            "Добыча газа за период, млн. м³"
            ],
            "n_variants":1
        },
        {
            "canonical":"Добыча жидкости в пластовых условиях за период",
            "variants":[
            "Добыча жидкости в пласт. условиях"
            ],
            "n_variants":1
        },
        {
            "canonical":"Добыча жидкости за год",
            "variants":[
            "Добыча жидкости в пласт."
            ],
            "n_variants":1
        },
        {
            "canonical":"Добыча нефти, т",
            "variants":[
            "Добыча нефти т."
            ],
            "n_variants":1
        },
        {
            "canonical":"Жесткость",
            "variants":[
            "Жесткость Ho"
            ],
            "n_variants":1
        },
        {
            "canonical":"Жидкость на которой вскрыт горизонт",
            "variants":[
            "Жидкость на которой вскрыт горизонт"
            ],
            "n_variants":1
        },
        {
            "canonical":"Забой искусственный",
            "variants":[
            "Искусственный забой , м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Забой|Альтитуда искусств., м",
            "variants":[
            "Забой искусств.,м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Забой|Альтитуда пробур., м",
            "variants":[
            "Забой пробур.,м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Защитный ток, ампер",
            "variants":[
            "Защитный ток, а."
            ],
            "n_variants":1
        },
        {
            "canonical":"Изливы с начала разработки",
            "variants":[
            "условиях С начала разработки"
            ],
            "n_variants":1
        },
        {
            "canonical":"Инвентарный номер оборудования",
            "variants":[
            "Инвентарный номер"
            ],
            "n_variants":1
        },
        {
            "canonical":"Интервал перфорации до",
            "variants":[
            "Интервал перфорации,"
            ],
            "n_variants":1
        },
        {
            "canonical":"Интервалы перфор. от",
            "variants":[
            "перфор. от"
            ],
            "n_variants":1
        },
        {
            "canonical":"Кат.тип",
            "variants":[
            "Тип"
            ],
            "n_variants":1
        },
        {
            "canonical":"Категория скважины",
            "variants":[
            "Категория скважины"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код НГДУ",
            "variants":[
            "Код"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код горизонта",
            "variants":[
            "Код горизонта"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код другого горизонта",
            "variants":[
            "Код другого горизонта"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код записи",
            "variants":[
            "Код записи"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код колонны",
            "variants":[
            "Код колонны"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код месторождения",
            "variants":[
            "Код месторождения"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код наг. ряда",
            "variants":[
            "Код наг. ряда"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код пласта (горизонта)",
            "variants":[
            "Код пласта, горизонта, простоя, ГТМ"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код площади",
            "variants":[
            "Код площади"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код причины простоя",
            "variants":[
            "Код причины простоя"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код схемы или материал покрытия",
            "variants":[
            "Схема или материал покрытия: описание, код"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код участка",
            "variants":[
            "Код участка"
            ],
            "n_variants":1
        },
        {
            "canonical":"Код, значение",
            "variants":[
            "Код, значение"
            ],
            "n_variants":1
        },
        {
            "canonical":"Количество вахт",
            "variants":[
            "Количество."
            ],
            "n_variants":1
        },
        {
            "canonical":"Количество материала",
            "variants":[
            "материал"
            ],
            "n_variants":1
        },
        {
            "canonical":"Количество соседних скважин",
            "variants":[
            "Количество соседних скважин, шт"
            ],
            "n_variants":1
        },
        {
            "canonical":"Конец  работы",
            "variants":[
            "Конец ."
            ],
            "n_variants":1
        },
        {
            "canonical":"Конец  ремонта",
            "variants":[
            "До ремонта"
            ],
            "n_variants":1
        },
        {
            "canonical":"Концетрация реагента",
            "variants":[
            "Концетрация %"
            ],
            "n_variants":1
        },
        {
            "canonical":"Коэффициент расходомера",
            "variants":[
            "Коэффициент расходомера"
            ],
            "n_variants":1
        },
        {
            "canonical":"Кривизна",
            "variants":[
            "Кривизна, град."
            ],
            "n_variants":1
        },
        {
            "canonical":"Макс. давление при посадке пробки _стоп_, кг\/см2",
            "variants":[
            "Макс. давление при посадке пробки \"стоп\",кг\/см²"
            ],
            "n_variants":1
        },
        {
            "canonical":"Месторождение",
            "variants":[
            "Месторождение"
            ],
            "n_variants":1
        },
        {
            "canonical":"Мощность",
            "variants":[
            "Водонас. мощность"
            ],
            "n_variants":1
        },
        {
            "canonical":"НГДУ",
            "variants":[
            "НГДУ"
            ],
            "n_variants":1
        },
        {
            "canonical":"Наименование материала",
            "variants":[
            "Наименование материала"
            ],
            "n_variants":1
        },
        {
            "canonical":"Наименование предприятия",
            "variants":[
            "Наименование"
            ],
            "n_variants":1
        },
        {
            "canonical":"Начало работы",
            "variants":[
            "Начало"
            ],
            "n_variants":1
        },
        {
            "canonical":"Начальное пластовое давление приведённое к водно-нефтяному контакту",
            "variants":[
            "Начальное пластовое давление приведенное к ВНК, атм."
            ],
            "n_variants":1
        },
        {
            "canonical":"Нефтенасыщенность",
            "variants":[
            "Нефтенасыщенность, %"
            ],
            "n_variants":1
        },
        {
            "canonical":"Нефтенасыщенность пласта",
            "variants":[
            "Нефтенасыщенность пласта, %"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер",
            "variants":[
            "Номер прибора"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер КНС",
            "variants":[
            "Номер КНС"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер блока",
            "variants":[
            "Номер блока"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер бригады",
            "variants":[
            "Дебет Номер бригады"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер бригады ПРС",
            "variants":[
            "Номер бригады ПРС"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер водовода",
            "variants":[
            "Номер водовода"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер линзы",
            "variants":[
            "Номер линзы"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер объекта в конце трубопровода",
            "variants":[
            "Номер трубопровода"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер объекта сбора",
            "variants":[
            "Номер объекта сбора"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер скважины",
            "variants":[
            "Номер скважины"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер участка",
            "variants":[
            "Номер участка"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер фидера",
            "variants":[
            "Номер фидера"
            ],
            "n_variants":1
        },
        {
            "canonical":"Номер цеха",
            "variants":[
            "Номер цеха"
            ],
            "n_variants":1
        },
        {
            "canonical":"Обводнённость, объёмная",
            "variants":[
            "Обводненность, %"
            ],
            "n_variants":1
        },
        {
            "canonical":"Объект",
            "variants":[
            "пласта объекта"
            ],
            "n_variants":1
        },
        {
            "canonical":"Объём закачки",
            "variants":[
            "Объём закачки воды"
            ],
            "n_variants":1
        },
        {
            "canonical":"Объёмный коэффициент",
            "variants":[
            "Объемный коэффициент"
            ],
            "n_variants":1
        },
        {
            "canonical":"Отклонение забоя от устья",
            "variants":[
            "Отклонение забоя от устья, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Плотность перфорац. кол\/ПМ",
            "variants":[
            "Плотность перворац. кол\/ПМ"
            ],
            "n_variants":1
        },
        {
            "canonical":"Площадь",
            "variants":[
            "Площадь"
            ],
            "n_variants":1
        },
        {
            "canonical":"Площадь водо-нефтеносной зоны",
            "variants":[
            "Площадь водо-нефтяной зоны"
            ],
            "n_variants":1
        },
        {
            "canonical":"Площадь по картограмме",
            "variants":[
            "Площадь по картограмме или объем закачки"
            ],
            "n_variants":1
        },
        {
            "canonical":"Предприятие наносившее покрытие",
            "variants":[
            "Предприятие, наносившее покрытие"
            ],
            "n_variants":1
        },
        {
            "canonical":"Приемистость",
            "variants":[
            "Приемистость"
            ],
            "n_variants":1
        },
        {
            "canonical":"Признак верха",
            "variants":[
            "Признак верха"
            ],
            "n_variants":1
        },
        {
            "canonical":"Примечание",
            "variants":[
            "Примечание"
            ],
            "n_variants":1
        },
        {
            "canonical":"Принятый коэффициент нефтеотдачи",
            "variants":[
            "Принятый К нефтеотдачи"
            ],
            "n_variants":1
        },
        {
            "canonical":"Причина простоя водовода",
            "variants":[
            "Причина простоя водовода"
            ],
            "n_variants":1
        },
        {
            "canonical":"Причина простоя скважины",
            "variants":[
            "Причина простоя скважины"
            ],
            "n_variants":1
        },
        {
            "canonical":"Продолжительность работ (час.)",
            "variants":[
            "Продолжительность час, время"
            ],
            "n_variants":1
        },
        {
            "canonical":"Процент обводненности объемный",
            "variants":[
            "Обводнённости объёмный"
            ],
            "n_variants":1
        },
        {
            "canonical":"Процент ухода жидкости в другой горизонт",
            "variants":[
            "% Ухода в другой горизонт"
            ],
            "n_variants":1
        },
        {
            "canonical":"Пьезопроводность",
            "variants":[
            "Пьезопроводность см\/сек"
            ],
            "n_variants":1
        },
        {
            "canonical":"Рабочее давление",
            "variants":[
            "Давление,  м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Расположение зацем. низа колонны",
            "variants":[
            "Расположение зацем. низа колонной, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Содержание O2, мг\/л",
            "variants":[
            "Содержание мг\/л, %"
            ],
            "n_variants":1
        },
        {
            "canonical":"Содержание асфальтенов",
            "variants":[
            "% Асфальтен"
            ],
            "n_variants":1
        },
        {
            "canonical":"Содержание парафинов",
            "variants":[
            "% Парафина"
            ],
            "n_variants":1
        },
        {
            "canonical":"Состояние",
            "variants":[
            "Состояние"
            ],
            "n_variants":1
        },
        {
            "canonical":"Состояние устья",
            "variants":[
            "Состояние устья"
            ],
            "n_variants":1
        },
        {
            "canonical":"Состояние устья скважины",
            "variants":[
            "Состояние устья скважины"
            ],
            "n_variants":1
        },
        {
            "canonical":"Состояние э\/кол.",
            "variants":[
            "Состояние э\/кол"
            ],
            "n_variants":1
        },
        {
            "canonical":"Состояние эксплуатационной колонны",
            "variants":[
            "Оправка эксплуатационной колонны"
            ],
            "n_variants":1
        },
        {
            "canonical":"Состояние эксплуатационной колонны скважины",
            "variants":[
            "Состояние э\/колонны скважины"
            ],
            "n_variants":1
        },
        {
            "canonical":"Способ закачки",
            "variants":[
            "Способ закачки"
            ],
            "n_variants":1
        },
        {
            "canonical":"Способ определения герметичности колонны",
            "variants":[
            "Способ определения герметичности колонны"
            ],
            "n_variants":1
        },
        {
            "canonical":"Способ эксплуатации",
            "variants":[
            "Способ эксплуатации"
            ],
            "n_variants":1
        },
        {
            "canonical":"Средняя глубина залегания подошвы пласта",
            "variants":[
            "Средняя глубина залегания подошвы пласта, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Средняя мощность общая",
            "variants":[
            "Средняя мощность"
            ],
            "n_variants":1
        },
        {
            "canonical":"Стоимость трубопровода балансовая, руб.",
            "variants":[
            "Балансовая стоимость , руб"
            ],
            "n_variants":1
        },
        {
            "canonical":"Сухой остаток",
            "variants":[
            "Сухой остаток"
            ],
            "n_variants":1
        },
        {
            "canonical":"Текущий коэффициент нефтеотдачи",
            "variants":[
            "Текущий коэффициент нефтеотдачи"
            ],
            "n_variants":1
        },
        {
            "canonical":"Температура пласта",
            "variants":[
            "Температура пласта, °C"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип КНС",
            "variants":[
            "Тип КНС"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип коллектора",
            "variants":[
            "Тип коллектора"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип коллектора, код",
            "variants":[
            "коллектора код"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип насоса",
            "variants":[
            "Тип насоса"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип объекта сбора",
            "variants":[
            "Тип объекта сбора"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип перфорат.",
            "variants":[
            "Тип перфорат."
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип перфоратора",
            "variants":[
            "Тип перфоратора"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип перфоратора, код",
            "variants":[
            "перфоратора код"
            ],
            "n_variants":1
        },
        {
            "canonical":"Тип расходом.",
            "variants":[
            "Тип расходом."
            ],
            "n_variants":1
        },
        {
            "canonical":"УБР\/УРБ",
            "variants":[
            "УБР"
            ],
            "n_variants":1
        },
        {
            "canonical":"Уд. вес жидкости, г\/см3",
            "variants":[
            "Уд. вес жидкости г\/см³"
            ],
            "n_variants":1
        },
        {
            "canonical":"Уд. вес продавочной жидкости, г.\/см3",
            "variants":[
            "Уд. вес продавочной жидкости, г\/см³"
            ],
            "n_variants":1
        },
        {
            "canonical":"Уд. вес цементного раствора, г.\/см3",
            "variants":[
            "Уд. вес цементного раствора, г\/см³"
            ],
            "n_variants":1
        },
        {
            "canonical":"Удельный вес по воздуху",
            "variants":[
            "Удельный вес по воздуху"
            ],
            "n_variants":1
        },
        {
            "canonical":"Удельный расход ингибитора",
            "variants":[
            "Удельный расход"
            ],
            "n_variants":1
        },
        {
            "canonical":"Удлинение ствола до продуктивн. горизонта, м",
            "variants":[
            "Удлинение ствола до продуктивн. горизонта, м"
            ],
            "n_variants":1
        },
        {
            "canonical":"Условия работы трубопровода",
            "variants":[
            "Условия работы трубопровода"
            ],
            "n_variants":1
        },
        {
            "canonical":"Условн. номер КНС",
            "variants":[
            "Условный номер КНС"
            ],
            "n_variants":1
        },
        {
            "canonical":"Условн. номер водовода",
            "variants":[
            "Условный номер водовода"
            ],
            "n_variants":1
        },
        {
            "canonical":"Условный номер скважины",
            "variants":[
            "Условный номер скважины"
            ],
            "n_variants":1
        },
        {
            "canonical":"Участок",
            "variants":[
            "Участок"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фактическая стоимость ремонта",
            "variants":[
            "Фактическая стоимость ремонта, руб"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд нагнетательных скважин: в бездействии",
            "variants":[
            "скважин В бездействии"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд нагнетательных скважин: в консервации",
            "variants":[
            "скважин В консервации"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд нагнетательных скважин: всего пробурено",
            "variants":[
            "скважин Всего пробурено"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд нагнетательных скважин: другие горизонты",
            "variants":[
            "скважин Другие горизонты"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд нагнетательных скважин: контрольные",
            "variants":[
            "скважин Контрольные"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд нагнетательных скважин: ликвидировано",
            "variants":[
            "скважин Ликвидировано"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд нагнетательных скважин: наблюдательных",
            "variants":[
            "скважин Наблюдательных"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд скважин эксплуатационный",
            "variants":[
            "Фонд эксплуатационных"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд эксплуатационных скважин: газлифт",
            "variants":[
            "скважин Газлифт"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд эксплуатационных скважин: передано под закачку",
            "variants":[
            "скважин Передано под закачку"
            ],
            "n_variants":1
        },
        {
            "canonical":"Фонд эксплуатационных скважин: фонтан",
            "variants":[
            "скважин Фонтан"
            ],
            "n_variants":1
        },
        {
            "canonical":"Число качаний",
            "variants":[
            "Число качаний кач\/мин"
            ],
            "n_variants":1
        },
        {
            "canonical":"Щелочность",
            "variants":[
            "Щелочность, см³"
            ],
            "n_variants":1
        },
        {
            "canonical":"Эффект нефтен. мощн., м",
            "variants":[
            "Эффект нефтен. мощн., м"
            ],
            "n_variants":1
        }
        ],
        _termSet: null,
         setTermDictionary: function (arr) {
          // публичный метод — если захочешь передавать словарь из app.js
          JSV.termDict = Array.isArray(arr) ? arr : [];
          JSV._termSet = null; // пересоберём при первом использовании
        },

        // нормализация подписей узлов и терминов из словаря:
        // - регистр -> нижний
        // - скобки с числами (например, "(3)") удаляем
        // - пунктуация/подчёркивания/много пробелов схлопываем
        _normLabel: function (s) {
          var t = String(s || "").toLowerCase();
          t = t.replace(/\(\s*\d+\s*\)\s*$/, "");           // убираем "(N)" в конце
          t = t.replace(/[.,;:!?/\\|[\]{}()+\-]+/g, " ");   // пунктуация -> пробел
          t = t.replace(/[_\s]+/g, " ").trim();             // лишние пробелы/подчёркивания
          return t;
        },

        _ensureTermSet: function () {
          if (JSV._termSet) return JSV._termSet;
          var set = Object.create(null);

          function addOne(v) {
            var n = JSV._normLabel(v);
            if (n) set[n] = true;
          }

          (JSV.termDict || []).forEach(function (item) {
            if (!item) return;
            if (item.canonical) addOne(item.canonical);
            if (Array.isArray(item.variants)) item.variants.forEach(addOne);
          });

          JSV._termSet = set;
          return set;
        },

        _isLeaf: function (d) {
          var kids = (d.children || d._children) || [];
          return kids.length === 0;
        },

        _leafMatchesDict: function (d) {
          var set = JSV._ensureTermSet();
          var lab = JSV._normLabel(d && d.name);
          return !!(lab && set[lab]);
        },
        _synAdj: null,  
        _mapNorms: function (s) {
          var out = [];
          function add(x){
            var n = JSV._normLabel(x);
            if (n && out.indexOf(n) === -1) out.push(n);
          }
          var str = String(s == null ? '' : s);
          add(str);
          var pipe = str.split('|');
          if (pipe.length > 1) add(pipe[pipe.length - 1]);
          str.split(';').forEach(function(part){ add(part); });
          return out;
        },

        _buildSynAdj: function (mapObj) {
        var adj = Object.create(null);
        function connect(a, b){
            if (!a || !b || a === b) return;
            (adj[a] || (adj[a] = Object.create(null)))[b] = 1;
            (adj[b] || (adj[b] = Object.create(null)))[a] = 1;
        }

        if (!mapObj || typeof mapObj !== 'object') return adj;
        if (Array.isArray(mapObj)) {
            for (var i = 0; i < mapObj.length; i++) {
            var pair = mapObj[i];
            if (!pair) continue;
            var L = JSV._mapNorms(pair[0]);
            var R = JSV._mapNorms(pair[1]);
            for (var a = 0; a < L.length; a++)
                for (var b = 0; b < R.length; b++)
                connect(L[a], R[b]);
            }
            return adj;
        }
        Object.keys(mapObj).forEach(function(key){
            var L = JSV._mapNorms(key);
            var val = mapObj[key];
            var arr = Array.isArray(val) ? val : [val];
            for (var i = 0; i < arr.length; i++) {
            var R = JSV._mapNorms(arr[i]);
            for (var a = 0; a < L.length; a++)
                for (var b = 0; b < R.length; b++)
                connect(L[a], R[b]);
            }
        });

        return adj;
        },

        setElseMapping: function(mapObj){
          JSV._synAdj = JSV._buildSynAdj(mapObj);
          if (JSV.treeData && typeof JSV.update === 'function') {
            JSV.update(JSV.treeData);
          }
        },
        update: function (source) {
            var duration = JSV.duration;
            var root = JSV.treeData;
            // Compute the new height, function counts total children of root node and sets tree height accordingly.
            // This prevents the layout looking squashed when new nodes are made visible or looking sparse when nodes are removed
            // This makes the layout more consistent.
            var levelWidth = [1];
            var childCount = function(level, n) {

                if (n.children && n.children.length > 0) {
                    if (levelWidth.length <= level + 1) {levelWidth.push(0);}

                    levelWidth[level + 1] += n.children.length;
                    n.children.forEach(function(d) {
                        childCount(level + 1, d);
                    });
                }
            };
            childCount(0, root);
            var newHeight = d3.max(levelWidth) * 45; // 25 pixels per line
            JSV.tree.size([newHeight, JSV.viewerWidth]);
            var nodes = JSV.tree.nodes(root).reverse(),
               links = JSV.tree.links(nodes);

           // 1) базовые флаги
            nodes.forEach(function (d) {
            d._isLeafNode = JSV._isLeaf(d);
            d._synLinked  = false; // по умолчанию нет связки
            });

            // 2) ищем пары по графу синонимов (если загружен)
            (function resolveSynonymLinks () {
            var adj = JSV._synAdj;
            if (!adj) return; // словарь ещё не загружен — пропускаем

            // индекс: НОРМАЛИЗОВАННАЯ_МЕТКА -> [узлы с этой меткой]
            var index = Object.create(null);

            function put(label, node) {
                var key = JSV._normLabel(label);
                if (!key) return;
                (index[key] || (index[key] = [])).push(node);
            }

            // собираем листья по их именам/лейблам
            nodes.forEach(function (d) {
                if (!d._isLeafNode) return;
                if (d.plainName) put(d.plainName, d);
                if (d.name && d.name !== d.plainName) put(d.name, d);
            });

            // помечаем связанные пары по графу синонимов
            Object.keys(index).forEach(function (lbl) {
    var neigh = adj[lbl];
    if (!neigh) return;
    var nodesA = index[lbl];

    
    if (Object.keys(neigh).length > 0) {
      nodesA.forEach(function (n) { n._synLinked = true; });
    }

    
    Object.keys(neigh).forEach(function (nb) {
      var nodesB = index[nb];
      if (!nodesB) return;
      nodesA.forEach(function (n) { n._synLinked = true; });
      nodesB.forEach(function (n) { n._synLinked = true; });
    });
  });
            })(); // end resolveSynonymLinks

            // 3) окраска листьев: зелёный если есть связка, иначе красный
            function leafFill(d) {
            if (d && d._isLeafNode) return d._synLinked ? '#059669' : '#dc2626';
            return null;
            }


            // 3) окраска листьев: зелёный если есть связка, иначе красный
            function leafFill(d){
              if (d && d._isLeafNode) return d._synLinked ? '#059669' : '#dc2626';
              return null;
            }
            var maxW = {};
            var maxDepth = 0;
            nodes.forEach(function(d) {
                maxDepth = Math.max(maxDepth, d.depth || 0);
                var label = JSV.getDisplayName(d) + (d.require ? '*' : '');
                var w = JSV.measureText(label);

                if (!maxW[d.depth] || w > maxW[d.depth]) maxW[d.depth] = w;
            });
                var offsets = [0]; 
                for (var depth = 0; depth <= maxDepth; depth++) {
                var prev = offsets[depth] || 0;
                var colWidth = JSV.TEXT_LEFT_X + (maxW[depth] || 0) + JSV.RIGHT_PAD + JSV.COLUMN_GAP;
                offsets[depth + 1] = prev + colWidth;
            }
            nodes.forEach(function(d) {
                d.y = offsets[d.depth];
            });
            var node = JSV.svgGroup.selectAll('g.node')
                .data(nodes, function(d) {
                    return d.id || (d.id = ++JSV.counter);
                });

            var nodeEnter = node.enter().append('g')
                .attr('class', function(d) {
                    return JSV.labels[d.name] ? 'node label' : 'node';
                })
                .classed('deprecated', function(d) {
                    return d.deprecated;
                })
                .attr('id', function(d, i) {
                    return 'n-' + d.id;
                })
                .attr('transform', function(d) {
                    return 'translate(' + source.y0 + ',' + source.x0 + ')';
                });

            nodeEnter.append('circle')
                //.attr('class', 'nodeCircle')
                .attr('r', 0)
                .classed('collapsed', function(d) {
                    return d._children ? true : false;
                })
                .on('click', JSV.click);

             nodeEnter.append('text')
                .attr('x', JSV.TEXT_LEFT_X)
                
                .attr('dy', '0.35em')
                .attr('class', function(d) {
                    return (d.children || d._children) ? 'node-text node-branch' : 'node-text';
                })
                .classed('abstract', function(d) {
                    return d.opacity < 1;
                })
                .attr('text-anchor', function(d) {
                    //return d.children || d._children ? 'end' : 'start';
                    return 'start';
                })
                .text(function(d) {
                    return JSV.getDisplayName(d) + (d.require ? '*' : '');
                })
                .style('fill-opacity', 0)
                .style('fill', leafFill)
                .on('click', JSV.clickTitle)
                .on('dblclick', function(d) {
                    JSV.click(d);
                    JSV.clickTitle(d);
                    d3.event.stopPropagation();
                });
                nodeEnter
                   .on('mouseover', function(d){
                    if (d && d.form != null && d.form !== '') {
                        __jsvShowFormTip(d.form, d3.event.pageX, d3.event.pageY);
                    }
                })
                .on('mousemove', function(){
                    __jsvMoveFormTip(d3.event.pageX, d3.event.pageY);
                })
                .on('mouseout', function(){
                    __jsvHideFormTip();
                });


            // Change the circle fill depending on whether it has children and is collapsed
            node.select('.node circle')
                .attr('r', 6.5)
                .classed('collapsed', function(d) {
                    return (d._children ? true : false);
                });

            // Transition nodes to their new position.
            var nodeUpdate = node.transition()
                .duration(duration)
                .attr('transform', function(d) {
                    return 'translate(' + d.y + ',' + d.x + ')';
                });

            // Fade the text in
            nodeUpdate.select('text')
                .style('fill-opacity', function(d){ return d.opacity || 1; })
                .style('fill', leafFill);

            // Transition exiting nodes to the parent's new position.
            var nodeExit = node.exit().transition()
                .duration(duration)
                .attr('transform', function(d) {
                    return 'translate(' + source.y + ',' + source.x + ')';
                })
                .remove();

            nodeExit.select('circle')
                .attr('r', 0);

            nodeExit.select('text')
                .style('fill-opacity', 0);

            // Update the links…
            var link = JSV.svgGroup.selectAll('path.link')
                .data(links, function(d) {
                    return d.target.id;
                });

            // Enter any new links at the parent's previous position.
            link.enter().insert('path', 'g')
                .attr('class', 'link')
                .attr('d', function(d) {
                    var o = {
                        x: source.x0,
                        y: source.y0
                    };

                    //console.info(d3.select('#n-'+d.source.id)[0][0].getBBox());

                    return JSV.diagonal1({
                        source: o,
                        target: o
                    });
                });

            // Transition links to their new position.
            link.transition()
                .duration(duration)
                .attr('d', JSV.diagonal1);

            // Transition exiting nodes to the parent's new position.
            link.exit().transition()
                .duration(duration)
                .attr('d', function(d) {
                    var o = {
                        x: source.x,
                        y: source.y
                    };
                    return JSV.diagonal1({
                        source: o,
                        target: o
                    });
                })
                .remove();

            // Stash the old positions for transition.
            nodes.forEach(function(d) {
                d.x0 = d.x;
                d.y0 = d.y;
            });
        },

        /**
         * Create the d3 diagram.
         *
         * @param {function} callback Function to run after the diagram is created
         */
        createDiagram: function(callback) {

                JSV.compileData(JSV.schema,false,'schema');

                // Calculate total nodes, max label length
                var totalNodes = 0;
                // panning variables
                //var panSpeed = 200;
                //var panBoundary = 20; // Within 20px from edges will pan when dragging.

                // size of the diagram
                var viewerWidth = JSV.viewerWidth ? JSV.viewerWidth : '100%';
                var viewerHeight = JSV.viewerHeight ? JSV.viewerHeight : '100%';

                JSV.zoomListener = d3.behavior.zoom().scaleExtent([0.1, 3]).on('zoom', JSV.zoom);
                JSV.measureTextEl = null;
                JSV.baseSvg = d3.select('#main-body').append('svg')
                    .attr('id', 'jsv-tree')
                    .attr('class', 'overlay')
                    .attr('width', viewerWidth)
                    .attr('height', viewerHeight)
                    .call(JSV.zoomListener);

                JSV.tree = d3.layout.tree()
                    .size([viewerHeight, viewerWidth]);

                // Call JSV.visit function to establish maxLabelLength
                JSV.visit(JSV.treeData, function(d) {
                    totalNodes++;
                    JSV.maxLabelLength = Math.max(d.name.length, JSV.maxLabelLength);

                }, function(d) {
                    return d.children && d.children.length > 0 ? d.children : null;
                });

                // Sort the tree initially in case the JSON isn't in a sorted order.
                //JSV.sortTree();

                JSV.svgGroup = JSV.baseSvg.append('g')
                    .attr('id', 'node-group');

                // Layout the tree initially and center on the root node.
                JSV.resetViewer();

                JSV.centerNode(JSV.treeData, 4);

                // define the legend svg, attaching a class for styling
                var legendData = [{
                    text: 'Expanded',
                    y: 20
                }, {
                    text: 'Collapsed',
                    iconCls: 'collapsed',
                    y: 40
                }, {
                    text: 'Selected',
                    itemCls: 'focus',
                    y: 60
                },{
                    text: 'Required*',
                    y: 80
                },{
                    text: 'Object{ }',
                    iconCls: 'collapsed',
                    y: 100
                },{
                    text: 'Array[minimum #]',
                    iconCls: 'collapsed',
                    y: 120
                },{
                    text: 'Abstract Property',
                    itemCls: 'abstract',
                    y: 140,
                    opacity: 0.5
                },{
                    text: 'Deprecated',
                    itemCls: 'deprecated',
                    y: 160
                }];


                var legendSvg = d3.select('#legend-items').append('svg')
                    .attr('width', 170)
                    .attr('height', 180);

                // Update the nodes…
                var legendItem = legendSvg.selectAll('g.item-group')
                    .data(legendData)
                    .enter()
                    .append('g')
                    .attr('class', function(d) {
                        var cls = 'item-group ';

                        cls += d.itemCls || '';
                        return cls;
                    })
                    .attr('transform', function(d) {
                        return 'translate(10, ' + d.y + ')';
                    });

                legendItem.append('circle')
                    .attr('r', 6.5)
                    .attr('class', function(d) {
                        return d.iconCls;
                    });

                legendItem.append('text')
                    .attr('x', 15)
                    .attr('dy', '.35em')
                    .attr('class', 'item-text')
                    .attr('text-anchor', 'start')
                    .style('fill-opacity', function(d) {
                        return d.opacity || 1;
                    })
                    .text(function(d) {
                        return d.text;
                    });

                if(typeof callback === 'function') {callback();}
            
        }
    };
}
(function(){
  var tipEl, hideTimer;

  function ensure() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'schema-tooltip';
      tipEl.style.display = 'none';
      document.body.appendChild(tipEl);
    }
  }
  function fmt(v){
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v, null, 2); } catch(e){ return String(v); }
  }
  function pos(x,y){
    var m = 12;
    var r = tipEl.getBoundingClientRect();
    var left = x + m, top = y + m;
    if (left + r.width  > window.innerWidth  - 8) left = x - r.width  - m;
    if (top  + r.height > window.innerHeight - 8) top  = y - r.height - m;
    tipEl.style.left = left + 'px';
    tipEl.style.top  = top  + 'px';
  }

  window.__jsvShowFormTip = function(content, x, y){
    ensure();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    tipEl.textContent = fmt(content);
    tipEl.style.display = 'block';
    pos(x,y);
  };
  window.__jsvMoveFormTip = function(x,y){
    if (!tipEl || tipEl.style.display === 'none') return;
    pos(x,y);
  };
  window.__jsvHideFormTip = function(delay){
    var d = typeof delay === 'number' ? delay : 120;
    if (!tipEl) return;
    hideTimer = setTimeout(function(){ tipEl.style.display = 'none'; }, d);
  };
})();
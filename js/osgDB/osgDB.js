/** -*- compile-command: "jslint-cli osgDB.js" -*-
 *
 *  Copyright (C) 2010 Cedric Pinson
 *
 *                  GNU LESSER GENERAL PUBLIC LICENSE
 *                      Version 3, 29 June 2007
 *
 * Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>
 * Everyone is permitted to copy and distribute verbatim copies
 * of this license document, but changing it is not allowed.
 *
 * This version of the GNU Lesser General Public License incorporates
 * the terms and conditions of version 3 of the GNU General Public
 * License
 *
 * Authors:
 *  Cedric Pinson <cedric.pinson@plopbyte.com>
 *
 */

var osgDB = {};

osgDB.ObjectWrapper = {};
osgDB.ObjectWrapper.serializers = {};
osgDB.ObjectWrapper.global = this;
osgDB.ObjectWrapper.getObject = function (path) {
    var scope = osgDB.ObjectWrapper.global;
    var splittedPath = path.split('.');
    for (var i = 0, l = splittedPath.length; i < l; i++) {
        var obj = scope[ splittedPath[i] ];
        if (obj === undefined) {
            return undefined;
        }
        scope = obj;
    }
    // create the new obj
    return new (scope)();
};
osgDB.ObjectWrapper.readObject = function (jsonObj) {

    var prop = Object.keys(jsonObj)[0];
    if (!prop) {
        osg.log("can't find property for object " + jsonObj);
        return undefined;
    }

    var obj = osgDB.ObjectWrapper.getObject(prop);
    if (!obj) {
        osg.log("can't instanciate object " + prop);
        return undefined;
    }

    var scope = osgDB.ObjectWrapper.serializers;
    var splittedPath = prop.split('.');
    for (var i = 0, l = splittedPath.length; i < l; i++) {
        var reader = scope[ splittedPath[i] ];
        if (reader === undefined) {
            osg.log("can't find function to read object " + prop + " - undefined");
            return undefined;
        }
        scope = reader;
    }
    scope(jsonObj[prop], obj);
    return obj;
};

osgDB.parseSceneGraph = function (node) {
    if (node.Version && node.Version > 0) {
        var getPropertyValue = function(o) {
            var props = Object.keys(o);
            for (var i = 0, l = props.length; i < l; i++) {
                if (props[i] !== "Generator" && props[i] !== "Version") {
                    return props[i];
                }
            }
            return undefined;
        };
        var key = getPropertyValue(node);
        if (key) {
            var obj = {};
            obj[key] = node[key];
            return osgDB.ObjectWrapper.readObject(obj);
        } else {
            osg.log("Can't parse scenegraph " + node);
        }
    } else {
        return osgDB.parseSceneGraph_deprecated(node);
    }
};
osgDB.parseSceneGraph_deprecated = function (node)
{
    var getFieldBackwardCompatible = function(field, json) {
        var value = json[field];
        if (value === undefined) {
            value = json[field.toLowerCase()];
        }
        return value;
    };
    var setName = function(osgjs, json) {
        var name = getFieldBackwardCompatible("Name", json);
        if (name && osgjs.setName !== undefined) {
            osgjs.setName(name);
        }
    };

    var setMaterial = function(osgjs, json) {
        setName(osgjs, json);
        osgjs.setAmbient(getFieldBackwardCompatible("Ambient", json));
        osgjs.setDiffuse(getFieldBackwardCompatible("Diffuse", json));
        osgjs.setEmission(getFieldBackwardCompatible("Emission", json));
        osgjs.setSpecular(getFieldBackwardCompatible("Specular", json));
        osgjs.setShininess(getFieldBackwardCompatible("Shininess", json));
    };

    var setBlendFunc = function(osgjs, json) {
        setName(osgjs, json);
        osgjs.setSourceRGB(json.SourceRGB);
        osgjs.setSourceAlpha(json.SourceAlpha);
        osgjs.setDestinationRGB(json.DestinationRGB);
        osgjs.setDestinationAlpha(json.DestinationAlpha);
    };

    var setTexture = function( osgjs, json) {
        var magFilter = json.MagFilter || json.mag_filter || undefined;
        if (magFilter) {
            osgjs.setMagFilter(magFilter);
        }
        var minFilter = json.MinFilter || json.min_filter || undefined;
        if (minFilter) {
            osgjs.setMinFilter(minFilter);
        }
        var wrapT = json.WrapT || json.wrap_t || undefined;
        if (wrapT) {
            osgjs.setWrapT(wrapT);
        }
        var wrapS = json.WrapS || json.wrap_s || undefined;
        if (wrapS) {
            osgjs.setWrapS(wrapS);
        }
        var file = getFieldBackwardCompatible("File", json);
        var img = new Image();
        img.src = file;
        osgjs.setImage(img);
    };

    var setStateSet = function(osgjs, json) {
        setName(osgjs, json);
        var textures = getFieldBackwardCompatible("Textures", json) || getFieldBackwardCompatible("TextureAttributeList", json) || undefined;
        if (textures) {
            for (var t = 0, tl = textures.length; t < tl; t++) {
                var file = getFieldBackwardCompatible("File", textures[t]);
                if (!file) {
                    osg.log("no texture on unit " + t + " skip it");
                    continue;
                }
                var tex = new osg.Texture();
                setTexture(tex, textures[t]);
                
                osgjs.setTextureAttributeAndMode(t, tex);
                osgjs.addUniform(osg.Uniform.createInt1(t,"Texture" + t));
            }
        }
        
        var blendfunc = getFieldBackwardCompatible("BlendFunc",json);
        if (blendfunc) {
            var newblendfunc = new osg.BlendFunc();
            setBlendFunc(newblendfunc, blendfunc);
            osgjs.setAttributeAndMode(newblendfunc);
        }

        var material = getFieldBackwardCompatible("Material",json);
        if (material) {
            var newmaterial = new osg.Material();
            setMaterial(newmaterial, material);
            osgjs.setAttributeAndMode(newmaterial);
        }
    };


    var newnode;
    var children = node.children;
    var primitives = node.primitives || node.Primitives || undefined;
    var attributes = node.attributes || node.Attributes || undefined;
    if (primitives || attributes) {
        newnode = new osg.Geometry();

        setName(newnode, node);

        osg.extend(newnode, node); // we should not do that
        node = newnode;
        node.primitives = primitives; // we should not do that
        node.attributes = attributes; // we should not do that

        var i;
        for ( var p = 0, lp = primitives.length; p < lp; p++) {
            var mode = primitives[p].mode;
            if (primitives[p].indices) {
                var array = primitives[p].indices;
                array = new osg.BufferArray(gl[array.type], array.elements, array.itemSize );
                if (!mode) {
                    mode = gl.TRIANGLES;
                } else {
                    mode = gl[mode];
                }
                primitives[p] = new osg.DrawElements(mode, array);
            } else {
                mode = gl[mode];
                var first = primitives[p].first;
                var count = primitives[p].count;
                primitives[p] = new osg.DrawArrays(mode, first, count);
            }
        }

        for (var key in attributes) {
            if (attributes.hasOwnProperty(key)) {
                var attributeArray = attributes[key];
                attributes[key] = new osg.BufferArray(gl[attributeArray.type], attributeArray.elements, attributeArray.itemSize );
            }
        }
    }

    var stateset = getFieldBackwardCompatible("StateSet", node);
    if (stateset) {
        var newstateset = new osg.StateSet();
        setStateSet(newstateset, stateset);
        node.stateset = newstateset;
    }

    var matrix = node.matrix || node.Matrix || undefined;
    if (matrix) {
        newnode = new osg.MatrixTransform();
        setName(newnode, node);

        osg.extend(newnode, node);
        newnode.setMatrix(osg.Matrix.copy(matrix));
        node = newnode;
    }

    var projection = node.projection || node.Projection || undefined;
    if (projection) {
        newnode = new osg.Projection();
        setName(newnode, node);
        osg.extend(newnode, node);
        newnode.setProjectionMatrix(osg.Matrix.copy(projection));
        node = newnode;
    }

    // default type
    if (node.objectType === undefined) {
        newnode = new osg.Node();
        setName(newnode, node);
        osg.extend(newnode, node);
        node = newnode;
    }


    if (children) {
        // disable children, it will be processed in the end
        node.children = [];

        for (var child = 0, childLength = children.length; child < childLength; child++) {
            node.addChild(osgDB.parseSceneGraph_deprecated(children[child]));
        }
    }

    return node;
};
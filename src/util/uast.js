/**
 * Copyright (c) Areslabs.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
 
import * as babel from "@babel/core";
import traverse from "@babel/traverse"
import { parse } from '@babel/parser'
import generator from '@babel/generator'
import * as t from "@babel/types"


export function parseCode(code) {
    return parse(code, {
        sourceType: "module",
        plugins: [
            'jsx',
            'classProperties',
            'objectRestSpread',
            'optionalChaining',
            ['decorators', {decoratorsBeforeExport: true}],
            'flow'
        ]
    })
}

export function geneCode(ast) {
    const code = generator(ast, {
        comments: false
    }).code
    return code
}

const babelTransformJSX = babel.createConfigItem(require("../misc/transformJSX"), {type: 'plugin'})
const babelRestSpread = babel.createConfigItem(require("@babel/plugin-syntax-object-rest-spread"))
const babelClassProperties = babel.createConfigItem(require("@babel/plugin-syntax-class-properties"))
const babelOptionalChaining = babel.createConfigItem(require("@babel/plugin-syntax-optional-chaining"))


export async function geneReactCode(ast) {
    let code = geneCode(ast)
    code = babel.transformSync(code, {
        babelrc: false,
        configFile: false,
        plugins: [
            babelRestSpread,
            babelClassProperties,
            babelOptionalChaining,
            babelTransformJSX,
        ]
    }).code

    return code
}

/**
 * for test
 * @param code
 */
export function printAST(code) {
    const ast = parseCode(code)
    console.log(JSON.stringify(ast))
}


export function isReactComponent(superClass) {
    if (!superClass) return false

    // Component, PureComponent
    if (superClass.type === 'Identifier'
        && ( superClass.name === 'Component' || superClass.name === 'PureComponent')) {
        return true
    }

    // React.Component, React.PureComponent
    if (superClass.type === 'MemberExpression'
        && superClass.object.name === 'React'
        && (superClass.property.name === 'Component' || superClass.property.name === 'PureComponent')
    ) {
        return true
    }

    return false
}


export function getFileInfo(ast) {
    let isRF = false
    let isEntry = false
    let isClassComp = false
    let isRNEntry = false
    let invokeSetState = false
    traverse(ast, {
        ClassDeclaration: path => {
            const sc = path.node.superClass
            isClassComp = isReactComponent(sc)
        },

        JSXOpeningElement: path => {
            if (path.node.name.name === 'Router') {
                isEntry = true
            }

            isRF = true
        },

        Identifier: path => {
            // Expo root
            if (path.node.name === 'registerRootComponent') {
                isRNEntry = true
            }
        },

        CallExpression: path => {
            const callee = path.node.callee
            if (callee.type === 'MemberExpression'
                && callee.object
                && callee.object.name === 'AppRegistry'
                && callee.property
                && callee.property.name === 'registerComponent'
            ) {
                isRNEntry = true
            }

            // 假定没有调用setState的组件， 都是无状态组件
            if (callee.type === 'MemberExpression'
                && callee.object
                && callee.object.type === 'ThisExpression'
                && callee.property
                && callee.property.name === 'setState'
            ) {
                invokeSetState = true
            }

        }
    })

    const isFuncComp = isRF && !isClassComp
    const isStatelessComp = (isFuncComp || (isClassComp && !invokeSetState))

    return {
        isRF,
        isRNEntry,
        isEntry,
        isFuncComp,
        isStatelessComp
    }
}

export function getPropsChain(memberExpression) {
    const chain = []

    let me = memberExpression
    while (me.type === 'MemberExpression') {
        if (me.property.type === 'Identifier') {
            chain.push(me.property.name)
        } else if (me.property.type === 'NumericLiteral') {
            chain.push(me.property.value)
        }

        me = me.object
    }

    if (me.type === 'ThisExpression') {
        chain.push('this')
    } else if (me.type === 'Identifier') {
        chain.push(me.name)
    }

    return chain.reverse()
}


export function decTemlate(name, rs) {
    let arr = null
    if (rs.type === 'ArrayExpression') {
        arr = [t.jsxText('\n'), ...rs.elements, t.jsxText('\n')]
    } else {
        arr = [t.jsxText('\n'), rs, t.jsxText('\n')]
    }

    return t.jsxElement(
        t.jsxOpeningElement(
            t.jsxIdentifier('template'),
            [
                t.jsxAttribute(t.jsxIdentifier('name'), t.stringLiteral(name))
            ]
        ),
        t.jsxClosingElement(t.jsxIdentifier('template')),
        arr,
        false
    )
}

export function isJSXChild(path) {
    return (
        path.inList
        && path.listKey === 'children'
        && path.type === 'JSXElement'
    )
}


export function isChildComp(name) {
    if (name === 'block') return false
    if (name === 'view') return false
    if (name === 'image') return false

    // 基本组件children 需要转化为childrencpt的组件
    if (global.execArgs.extChildComp.has(name)) {
        return true
    }

    // 基本组件children 不需要转化为childrencpt的组件
    if (global.execArgs.allExtComp.has(name)) {
        return false
    }

    // 自定义组件 children都需要转化为childrencpt
    return true
}

export function isChildCompChild(path) {
    const jc = isJSXChild(path)
    if (!jc) return false

    const parentElement = path.parentPath
    const name = parentElement.node.openingElement.name.name


    return isChildComp(name)
}



export function isBindElement(jsxOp) {

    let name = null
    if (jsxOp.name.type === 'JSXMemberExpression') {
        name = jsxOp.name.object.name
    } else {
        name = jsxOp.name.name
    }


    return isBindElementByName(name)
}

export function isBindElementByName(name) {

    if (name === 'view' || name === 'block' || name === 'image') {
        return true
    }

    if (global.execArgs.extReactComp.has(name)) {
        return false
    }

    if (global.execArgs.allExtComp.has(name)) {
        return true
    }

    return false
}





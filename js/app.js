import {generateDataset} from './dataGenerator.js';
import {missingSummary,duplicateCount,fillMissing,removeDuplicates,cleanAll,normalizeNumeric} from './dataCleaning.js';
import {buildWarehouse} from './dataWarehouse.js';
import {olap} from './olap.js';
import {mineRules} from './associationMining.js';
import {kmeans} from './clustering.js';
import {train} from './classification.js';
import {dashboardCharts,olapChart,clusterChart} from './charts.js';
import {money,avg,sum,round,tableHTML,toast,inferSchema,parseCSV,isBlank} from './utils.js';
import {exportDataset,exportFact} from './export.js';

const state={
    rows:[],
    schema:null,
    warehouse:null,
    cluster:null,
    model:null,
    history:[],
    source:'',
    fileName:''
};

const $=id=>document.getElementById(id);

function log(msg){
    state.history.unshift({
        time:new Date().toLocaleTimeString(),
        msg
    });

    renderHistory();
}

function renderHistory(){
    $('history').innerHTML=
        state.history.length
            ? state.history
                .map(x=>`<div class="history-item"><b>${x.time}</b> — ${x.msg}</div>`)
                .join('')
            : '<div class="history-item">No actions yet.</div>';
}

function requireData(){

    if(!state.rows.length){
        toast('Import or generate a dataset first.');
        return false;
    }

    return true;
}

function numericMeasure(){

    return state.schema?.numeric?.find(
        c=>/amount|revenue|sales|price|total|value|cost|profit|quantity|qty/i.test(c)
    ) || state.schema?.numeric?.[0];
}

function updateStatus(){

    const r=state.rows;

    if(!r.length){

        [
            'kpiOrders',
            'kpiRevenue',
            'kpiAOV',
            'kpiDelivery',
            'kpiRating',
            'kpiCancel'
        ].forEach(
            (id,i)=>
                $(id).textContent=
                    i===0
                        ? '0'
                        : i===1||i===2
                            ? '₹0'
                            : i===3
                                ? '0'
                                : i===4
                                    ? '0.0'
                                    : '0%'
        );

        return;
    }

    const nums=state.schema?.numeric||[];

    const moneyCol=numericMeasure();

    const revenue=
        moneyCol
            ? sum(
                r.map(
                    x=>Number(x[moneyCol])
                )
            )
            : 0;

    const timeCol=
        state.schema?.numeric?.find(
            c=>/delivery|time|minutes|duration/i.test(c)
        );

    const ratingCol=
        state.schema?.numeric?.find(
            c=>/rating|score/i.test(c)
        );

    const target=state.schema?.target;

    const cancel=
        target
            ? r.filter(
                x=>/cancel|failed|reject|return/i.test(
                    String(x[target])
                )
            ).length
            : 0;

    $('kpiOrders').textContent=
        r.length.toLocaleString();

    $('kpiRevenue').textContent=
        money(revenue);

    $('kpiAOV').textContent=
        money(revenue/r.length);

    $('kpiDelivery').textContent=
        timeCol
            ? round(
                avg(
                    r.map(
                        x=>Number(x[timeCol])
                    )
                ),
                1
            )+''
            : '—';

    $('kpiRating').textContent=
        ratingCol
            ? round(
                avg(
                    r.map(
                        x=>Number(x[ratingCol])
                    )
                ),
                2
            )
            : '—';

    $('kpiCancel').textContent=
        target
            ? round(
                cancel/r.length*100,
                1
            )+'%'
            : '—';

    dashboardCharts(
        r,
        state.schema
    );

    renderPipeline();
}

function renderPipeline(){

    const steps=[
        [
            'Dataset loaded',
            state.rows.length>0
        ],

        [
            'Data cleaned',
            state.rows.length>0 &&
            missingSummary(state.rows)===0 &&
            duplicateCount(state.rows)===0
        ],

        [
            'Warehouse built',
            !!state.warehouse
        ],

        [
            'OLAP analysed',
            state.history.some(
                x=>x.msg.includes('OLAP')
            )
        ],

        [
            'Mining executed',
            state.history.some(
                x=>
                    x.msg.includes('mining') ||
                    x.msg.includes('K-Means') ||
                    x.msg.includes('classification')
            )
        ]
    ];

    $('pipeline').innerHTML=
        steps
            .map(
                ([x,d])=>
                    `<div class="pipeline-step ${d?'done':''}">
                        <span class="dot"></span>
                        ${x}
                        <span style="margin-left:auto;color:#687589">
                            ${d?'Done':'Pending'}
                        </span>
                    </div>`
            )
            .join('');
}

function renderDataset(){

    if(!state.rows.length){

        $('dataTable').innerHTML='';

        $('datasetMeta').textContent=
            'No dataset loaded';

        return;
    }

    const q=
        $('tableSearch')
            .value
            .toLowerCase();

    const f=
        $('statusFilter').value;

    const rows=
        state.rows
            .filter(
                r=>
                    (
                        f==='all' ||
                        String(
                            r[state.schema?.target]
                        )===f
                    ) &&
                    JSON.stringify(r)
                        .toLowerCase()
                        .includes(q)
            )
            .slice(0,500);

    $('dataTable').innerHTML=
        tableHTML(rows);

    $('datasetMeta').textContent=
        `Showing ${rows.length} of ${state.rows.length} records · ${state.fileName||'Generated dataset'}`;

    const missing=
        missingSummary(state.rows);

    const dups=
        duplicateCount(state.rows);

    $('missingCount').textContent=
        missing;

    $('duplicateCount').textContent=
        dups;

    $('cleanRecords').textContent=
        state.rows.length;

    $('datasetStats').innerHTML=[
        ['Records',state.rows.length],
        ['Columns',state.schema?.columns.length||0],
        ['Missing values',missing],
        ['Duplicates',dups],
        ['Numeric fields',state.schema?.numeric.length||0],
        ['Categorical fields',state.schema?.categorical.length||0]
    ]
    .map(
        x=>
            `<div class="stat">
                <span>${x[0]}</span>
                <b>${x[1]}</b>
            </div>`
    )
    .join('');

    renderSchema();
    renderStatusFilter();
}

function renderSchema(){

    if(!state.schema){

        $('schemaInfo').innerHTML='';

        $('schemaSummary').textContent=
            'Generate or import a dataset to inspect its columns.';

        return;
    }

    const s=state.schema;

    $('schemaSummary').textContent=
        `${s.columns.length} columns · ${s.numeric.length} numeric · ${s.categorical.length} categorical · ${s.date.length} date · Target: ${s.target||'not detected'}`;

    $('schemaInfo').innerHTML=
        s.columns
            .map(
                c=>
                    `<div class="schema-chip">
                        <b>${c.name}</b>
                        <span>${c.type}</span>
                        <small>${c.unique} unique · ${c.missing} missing</small>
                    </div>`
            )
            .join('');
}

function renderStatusFilter(){

    const sel=$('statusFilter');

    sel.innerHTML=
        '<option value="all">All records</option>';

    if(state.schema?.target){

        [
            ...new Set(
                state.rows.map(
                    r=>String(
                        r[state.schema.target]
                    )
                )
            )
        ]
        .slice(0,100)
        .forEach(
            v=>{
                sel.insertAdjacentHTML(
                    'beforeend',
                    `<option value="${String(v).replaceAll('"','&quot;')}">${String(v)}</option>`
                );
            }
        );
    }
}

function populateSelect(
    id,
    items,
    selected=''
){

    const el=$(id);

    if(!el)return;

    el.innerHTML=
        items
            .map(
                x=>
                    `<option value="${String(x).replaceAll('"','&quot;')}" ${x===selected?'selected':''}>${x}</option>`
            )
            .join('');
}

function checkboxes(
    id,
    items,
    defaults=2
){

    const el=$(id);

    if(!el)return;

    el.innerHTML=
        items
            .map(
                (x,i)=>
                    `<label class="check-item">
                        <input
                            type="checkbox"
                            value="${String(x).replaceAll('"','&quot;')}"
                            ${i<defaults?'checked':''}
                        >
                        ${x}
                    </label>`
            )
            .join('');
}

function selectedChecks(id){

    return [
        ...document.querySelectorAll(
            `#${id} input:checked`
        )
    ]
    .map(
        x=>x.value
    );
}


// ============================================================
// K-MEANS VISUALIZATION AXIS SELECTION
// Automatically chooses useful continuous numeric columns.
//
// IMPORTANT:
// This only controls the DEFAULT visualization axes.
// It does NOT change the K-Means algorithm.
// ============================================================

function chooseClusterVisualizationAxes(
    rows,
    numericColumns
){

    if(
        !numericColumns ||
        numericColumns.length===0
    ){

        return {
            x:'',
            y:''
        };
    }


    // --------------------------------------------------------
    // Analyze every numeric column
    // --------------------------------------------------------

    const information=
        numericColumns.map(
            column=>{

                const values=
                    rows
                        .map(
                            row=>
                                Number(
                                    row[column]
                                )
                        )
                        .filter(
                            Number.isFinite
                        );

                const uniqueValues=
                    new Set(values).size;

                const uniqueRatio=
                    values.length
                        ? uniqueValues /
                          values.length
                        : 0;

                return {

                    column,

                    uniqueValues,

                    uniqueRatio,

                    name:
                        String(
                            column
                        ).toLowerCase()
                };
            }
        );


    // --------------------------------------------------------
    // Ignore ID-like numeric columns
    // --------------------------------------------------------

    const usable=
        information.filter(
            item=>{

                const isID=
                    /\b(id|code|number|no)\b/
                        .test(item.name) ||

                    item.name.includes(
                        'orderid'
                    ) ||

                    item.name.includes(
                        'customerid'
                    ) ||

                    item.name.includes(
                        'userid'
                    ) ||

                    item.name.includes(
                        'productid'
                    ) ||

                    item.name.includes(
                        'transactionid'
                    );

                return !isID;
            }
        );


    const pool=
        usable.length
            ? usable
            : information;


    // --------------------------------------------------------
    // X-axis keywords
    //
    // Prefer business measures:
    // Amount, Sales, Revenue, Price, etc.
    // --------------------------------------------------------

    const xKeywords=[
        'amount',
        'sales',
        'revenue',
        'price',
        'value',
        'cost',
        'total',
        'spend',
        'income',
        'profit',
        'bill',
        'fare',
        'charge'
    ];


    // --------------------------------------------------------
    // Y-axis keywords
    //
    // Prefer:
    // Delivery Time, Duration, Rating, Score, etc.
    // --------------------------------------------------------

    const yKeywords=[
        'delivery',
        'duration',
        'time',
        'rating',
        'score',
        'age',
        'minutes',
        'days',
        'hours',
        'distance'
    ];


    function keywordScore(
        name,
        keywords
    ){

        let score=0;

        keywords.forEach(
            (
                keyword,
                index
            )=>{

                if(
                    name.includes(
                        keyword
                    )
                ){

                    score+=
                        (
                            keywords.length -
                            index
                        ) * 100;
                }
            }
        );

        return score;
    }


    // --------------------------------------------------------
    // Prefer continuous variables
    // --------------------------------------------------------

    function continuousScore(
        item
    ){

        let score=
            item.uniqueRatio * 100;


        if(
            item.uniqueValues>=20
        ){

            score+=50;
        }


        if(
            item.uniqueValues>=50
        ){

            score+=40;
        }


        if(
            item.uniqueValues>=100
        ){

            score+=30;
        }


        // Quantity-like fields such as
        // 1,2,3,4,5 should be less preferred.

        if(
            item.uniqueValues<=5
        ){

            score-=100;
        }


        if(
            item.uniqueValues<=10
        ){

            score-=40;
        }


        return score;
    }


    // ========================================================
    // SELECT X AXIS
    // ========================================================

    const xCandidates=
        [...pool]
            .map(
                item=>({

                    ...item,

                    score:
                        keywordScore(
                            item.name,
                            xKeywords
                        ) +
                        continuousScore(
                            item
                        )
                })
            )
            .sort(
                (a,b)=>
                    b.score -
                    a.score
            );


    const x=
        xCandidates[0]?.column ||
        pool[0]?.column ||
        '';


    // ========================================================
    // SELECT Y AXIS
    // ========================================================

    const yCandidates=
        [...pool]
            .filter(
                item=>
                    item.column!==x
            )
            .map(
                item=>({

                    ...item,

                    score:
                        keywordScore(
                            item.name,
                            yKeywords
                        ) +
                        continuousScore(
                            item
                        )
                })
            )
            .sort(
                (a,b)=>
                    b.score -
                    a.score
            );


    let y=
        yCandidates[0]?.column ||
        '';


    // --------------------------------------------------------
    // Fallback
    // --------------------------------------------------------

    if(!y){

        y=
            pool.find(
                item=>
                    item.column!==x
            )?.column ||
            '';
    }


    return {
        x,
        y
    };
}


// ============================================================
// CONFIGURE TOOLS
// ============================================================

function configureTools(){

    if(!state.schema)return;

    const s=state.schema;


    // ========================================================
    // EXISTING OLAP
    // ========================================================

    populateSelect(
        'olapDim1',
        s.categorical
    );

    populateSelect(
        'olapDim2',
        s.categorical
    );

    populateSelect(
        'olapDim3',
        s.categorical
    );

    populateSelect(
        'olapMeasure',
        s.numeric
    );


    // ========================================================
    // EXISTING ASSOCIATION MINING
    // ========================================================

    populateSelect(
        'assocA',
        s.categorical
    );

    populateSelect(
        'assocB',
        s.categorical,
        s.categorical[1] ||
        s.categorical[0]
    );


    // ========================================================
    // EXISTING CLASSIFICATION
    // ========================================================

    populateSelect(
        'classTarget',
        s.categorical,
        s.target ||
        s.categorical[0]
    );


    checkboxes(
        'clusterFeatures',
        s.numeric,
        Math.min(
            3,
            s.numeric.length
        )
    );


    checkboxes(
        'classFeatures',
        s.numeric,
        Math.min(
            3,
            s.numeric.length
        )
    );


    // ========================================================
    // K-MEANS ONLY
    //
    // Automatically choose useful default X/Y axes.
    // User can still manually change them.
    // ========================================================

    const axes=
        chooseClusterVisualizationAxes(
            state.rows,
            s.numeric
        );


    populateSelect(
        'clusterXAxis',
        s.numeric,
        axes.x
    );


    populateSelect(
        'clusterYAxis',
        s.numeric,
        axes.y
    );


    // ========================================================
    // EXISTING CLASSIFICATION PREDICTION INPUTS
    // ========================================================

    renderPredictionInputs();
}

function renderPredictionInputs(){

    const el=$('predictionInputs');

    if(!state.schema){

        el.innerHTML='';

        return;
    }

    const fs=
        selectedChecks(
            'classFeatures'
        );

    el.innerHTML=
        fs
            .map(
                f=>
                    `<label>
                        ${f}
                        <input
                            data-pred-feature="${String(f).replaceAll('"','&quot;')}"
                            type="number"
                            value="0"
                            step="any"
                        >
                    </label>`
            )
            .join('');
}

function renderWarehouse(){

    if(!state.warehouse){

        $('schemaDiagram').innerHTML=
            '<div class="schema-box"><h4>Build the warehouse</h4><div>Dimensions will be created automatically from categorical columns.</div></div>';

        $('dimensionTables').innerHTML='';

        return;
    }

    const w=state.warehouse;

    $('schemaDiagram').innerHTML=
        `<div class="schema-box fact">
            <h4>FACT TABLE</h4>
            <div>FactID — PK</div>
            ${w.measures.map(
                x=>`<div>${x}</div>`
            ).join('')}
        </div>
        ${
            w.dimensions.map(
                d=>
                    `<div class="schema-line"></div>
                    <div class="schema-box">
                        <h4>${d.name}</h4>
                        <div>${d.key} — PK</div>
                        <div>${d.sourceColumn}</div>
                    </div>`
            ).join('')
        }`;

    $('dimensionTables').innerHTML=
        w.dimensions
            .map(
                d=>
                    `<div class="panel">
                        <div class="panel-head">
                            <div>
                                <h3>${d.name}</h3>
                                <span>${d.sourceColumn}</span>
                            </div>
                        </div>
                        <div class="table-wrap">
                            <table>
                                ${tableHTML(
                                    d.rows.slice(
                                        0,
                                        200
                                    )
                                )}
                            </table>
                        </div>
                    </div>`
            )
            .join('');

    $('factTable').innerHTML=
        tableHTML(
            w.fact.slice(
                0,
                200
            )
        );
}

function importRows(
    rows,
    name
){

    if(!rows.length){

        toast(
            'The file contains no data rows.'
        );

        return;
    }

    state.rows=
        normalizeNumeric(
            rows,
            inferSchema(rows)
        );

    state.schema=
        inferSchema(
            state.rows
        );

    state.warehouse=null;

    state.cluster=null;

    state.model=null;

    state.fileName=name;

    state.source=
        'Imported CSV';

    log(
        `Imported ${state.rows.length} records from ${name}.`
    );

    configureTools();

    renderDataset();

    updateStatus();

    renderWarehouse();

    toast(
        'Dataset imported and schema detected.'
    );
}

function runOlap(){

    if(!requireData())return;

    const r=
        olap(
            state.rows,
            $('olapMode').value,
            {
                dim1:$('olapDim1').value,
                dim2:$('olapDim2').value,
                dim3:$('olapDim3').value,
                measure:$('olapMeasure').value
            }
        );

    $('olapTitle').textContent=
        r.title;

    $('olapDescription').textContent=
        r.desc;

    $('olapTable').innerHTML=
        tableHTML(r.rows);

    olapChart(r);

    log(
        `OLAP analysis executed: ${r.title}`
    );

    renderPipeline();
}

function runAssociation(){

    if(!requireData())return;

    const a=$('assocA').value;

    const b=$('assocB').value;

    const rules=
        mineRules(
            state.rows,
            a,
            b,
            Number(
                $('minConfidence').value
            ),
            Number(
                $('minLift').value
            )
        );

    $('associationTable').innerHTML=
        tableHTML(rules);

    $('associationPair').textContent=
        `${a} → ${b}`;

    $('associationMetrics').innerHTML=[
        [
            'Rules found',
            rules.length
        ],
        [
            'Confidence',
            `${Number(
                $('minConfidence').value
            )*100}%`
        ],
        [
            'Lift ≥',
            Number(
                $('minLift').value
            )
        ],
        [
            'Columns',
            `${a} → ${b}`
        ]
    ]
    .map(
        x=>
            `<div class="metric">
                <span>${x[0]}</span>
                <b>${x[1]}</b>
            </div>`
    )
    .join('');

    log(
        `Association mining executed: ${rules.length} rules found`
    );

    renderPipeline();
}

function runCluster(){

    if(!requireData())return;

    const fs=
        selectedChecks(
            'clusterFeatures'
        );

    if(fs.length<2){

        toast(
            'Select at least two numeric features for clustering.'
        );

        return;
    }

    const x=
        $('clusterXAxis').value;

    const y=
        $('clusterYAxis').value;

    if(!x||!y){

        toast(
            'Select X and Y axes for the cluster visualization.'
        );

        return;
    }

    const k=
        Number(
            $('clusterK').value
        );

    try{

        state.cluster=
            kmeans(
                state.rows,
                k,
                fs
            );

        state.rows=
            state.cluster.rows;

        state.schema=
            inferSchema(
                state.rows
            );

        $('clusterTable').innerHTML=
            tableHTML(
                state.cluster.profiles
            );

        $('clusterFeatureLabel').textContent=
            `${x} vs ${y} • Clustering uses ${fs.length} selected features`;

        clusterChart(
            state.rows,
            x,
            y
        );

        log(
            `K-Means clustering executed with K=${k} using ${fs.join(', ')}; visualized ${x} vs ${y}.`
        );

        updateStatus();

    }
    catch(e){

        toast(
            e.message
        );
    }
}

function runClassification(){

    if(!requireData())return;

    const target=
        $('classTarget').value;

    const features=
        selectedChecks(
            'classFeatures'
        );

    if(
        !target ||
        features.length<1
    ){

        toast(
            'Select a target and at least one numeric predictor.'
        );

        return;
    }

    const classes=
        new Set(
            state.rows
                .map(
                    r=>r[target]
                )
                .filter(
                    v=>!isBlank(v)
                )
        );

    if(classes.size<2){

        toast(
            'Classification needs at least two target classes.'
        );

        return;
    }

    try{

        state.model=
            train(
                state.rows,
                {
                    features,
                    target,
                    testSize:Number(
                        $('testSize').value
                    ),
                    seed:42,
                    maxDepth:4,
                    minLeaf:3
                }
            );

        $('accuracyScore').innerHTML=
            `${round(
                state.model.accuracy*100,
                1
            )}%<small>Accuracy · test n=${state.model.testSize}</small>`;

        $('modelMeta').textContent=
            `Target: ${target} · Features: ${features.join(', ')} · Train n=${state.model.trainSize}`;

        $('modelMetrics').innerHTML=[
            [
                'Precision',
                `${round(
                    state.model.precision*100,
                    1
                )}%`
            ],
            [
                'Recall',
                `${round(
                    state.model.recall*100,
                    1
                )}%`
            ],
            [
                'F1 Score',
                `${round(
                    state.model.f1*100,
                    1
                )}%`
            ]
        ]
        .map(
            x=>
                `<div class="metric">
                    <span>${x[0]}</span>
                    <b>${x[1]}</b>
                </div>`
        )
        .join('');

        $('confusionMatrix').innerHTML=
            `<table>
                <thead>
                    <tr>
                        <th>Actual / Predicted</th>
                        ${state.model.labels.map(
                            x=>`<th>${x}</th>`
                        ).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${
                        state.model.labels.map(
                            a=>
                                `<tr>
                                    <th>${a}</th>
                                    ${
                                        state.model.labels.map(
                                            p=>
                                                `<td>${state.model.matrix[a][p]}</td>`
                                        ).join('')
                                    }
                                </tr>`
                        ).join('')
                    }
                </tbody>
            </table>`;

        $('treeRules').innerHTML=
            state.model.rules
                .map(
                    r=>
                        `<div class="rule">${r}</div>`
                )
                .join('');

        renderPredictionInputs();

        log(
            `Decision tree classification executed: ${round(state.model.accuracy*100,1)}% accuracy on ${target}.`
        );

        renderPipeline();

        toast(
            'Real Decision Tree trained successfully.'
        );

    }
    catch(e){

        toast(
            e.message
        );
    }
}

function reset(){

    state.rows=[];

    state.schema=null;

    state.warehouse=null;

    state.cluster=null;

    state.model=null;

    state.history=[];

    state.fileName='';

    [
        'dataTable',
        'dimensionTables',
        'factTable',
        'olapTable',
        'associationTable',
        'clusterTable',
        'treeRules',
        'cleanLog',
        'schemaInfo',
        'confusionMatrix',
        'modelMetrics'
    ]
    .forEach(
        id=>{
            if($(id))
                $(id).innerHTML='';
        }
    );

    $('schemaDiagram').innerHTML=
        '<div class="schema-box"><h4>Build the warehouse</h4><div>Import or generate data first.</div></div>';

    updateStatus();

    renderDataset();

    renderHistory();

    toast(
        'Project reset.'
    );
}


$('sidebarNav').addEventListener(
    'click',
    e=>{

        const b=
            e.target.closest(
                '.nav-item'
            );

        if(!b)return;

        document
            .querySelectorAll(
                '.nav-item'
            )
            .forEach(
                x=>
                    x.classList.remove(
                        'active'
                    )
            );

        b.classList.add(
            'active'
        );

        document
            .querySelectorAll(
                '.page'
            )
            .forEach(
                x=>
                    x.classList.remove(
                        'active'
                    )
            );

        $(b.dataset.section)
            .classList.add(
                'active'
            );

        $('pageTitle').textContent=
            b.querySelector(
                'span'
            ).textContent;
    }
);


$('generateBtn').onclick=()=>{

    const n=
        Math.min(
            10000,
            Math.max(
                10,
                Number(
                    $('recordCount').value
                )||250
            )
        );

    const rows=
        generateDataset(n);

    importRows(
        rows,
        'Generated demo dataset'
    );

    log(
        `Generated ${n} base orders with intentional missing values and duplicates.`
    );
};


$('datasetFile').onchange=
    async e=>{

        const file=
            e.target.files[0];

        if(!file)return;

        try{

            importRows(
                parseCSV(
                    await file.text()
                ),
                file.name
            );

        }
        catch(err){

            toast(
                'Could not parse CSV: '+
                err.message
            );
        }
    };


$('tableSearch').oninput=
    renderDataset;

$('statusFilter').onchange=
    renderDataset;


$('fillMissingBtn').onclick=()=>{

    if(!requireData())return;

    const before=
        missingSummary(
            state.rows
        );

    state.rows=
        fillMissing(
            state.rows,
            state.schema
        );

    state.schema=
        inferSchema(
            state.rows
        );

    log(
        `Filled ${before} missing values using numeric means and categorical modes.`
    );

    configureTools();

    renderDataset();

    updateStatus();

    toast(
        'Missing values filled.'
    );
};


$('removeDupBtn').onclick=()=>{

    if(!requireData())return;

    const before=
        state.rows.length;

    state.rows=
        removeDuplicates(
            state.rows
        );

    log(
        `Removed ${before-state.rows.length} duplicate rows.`
    );

    renderDataset();

    updateStatus();

    toast(
        'Duplicates removed.'
    );
};


$('cleanAllBtn').onclick=()=>{

    if(!requireData())return;

    const before=
        state.rows.length;

    state.rows=
        cleanAll(
            state.rows,
            state.schema
        );

    state.schema=
        inferSchema(
            state.rows
        );

    $('cleanLog').innerHTML=
        `<div class="log-item">
            ✓ Numeric fields normalized.
        </div>

        <div class="log-item">
            ✓ Missing numeric values filled with column means.
        </div>

        <div class="log-item">
            ✓ Missing categorical values filled with column modes.
        </div>

        <div class="log-item">
            ✓ Duplicate rows removed.
        </div>

        <div class="log-item">
            ✓ ETL complete: ${before} → ${state.rows.length} records.
        </div>`;

    log(
        `Data cleaning completed: ${before} → ${state.rows.length} records.`
    );

    configureTools();

    renderDataset();

    updateStatus();

    toast(
        'Dynamic ETL cleaning completed.'
    );
};


$('buildWarehouseBtn').onclick=()=>{

    if(!requireData())return;

    if(!state.schema?.categorical.length){

        toast(
            'Warehouse needs at least one categorical dimension.'
        );

        return;
    }

    state.warehouse=
        buildWarehouse(
            state.rows,
            state.schema
        );

    renderWarehouse();

    log(
        `Dynamic star schema built: ${state.warehouse.dimensions.length} dimensions, ${state.warehouse.fact.length} fact rows.`
    );

    renderPipeline();

    toast(
        'Dynamic star schema built.'
    );
};


$('runOlapBtn').onclick=
    runOlap;

$('runAssociationBtn').onclick=
    runAssociation;

$('runClusterBtn').onclick=
    runCluster;

$('runClassificationBtn').onclick=
    runClassification;


document.addEventListener(
    'change',
    e=>{

        if(
            e.target.closest(
                '#classFeatures'
            )
        ){

            renderPredictionInputs();
        }
    }
);


$('predictBtn').onclick=()=>{

    if(!state.model){

        toast(
            'Train the model first.'
        );

        return;
    }

    const r={};

    document
        .querySelectorAll(
            '[data-pred-feature]'
        )
        .forEach(
            i=>
                r[
                    i.dataset.predFeature
                ]=
                    Number(
                        i.value
                    )
        );

    const p=
        state.model.predict(
            r
        );

    $('predictionResult').className=
        'prediction';

    $('predictionResult').textContent=
        `Predicted ${state.model.target}: ${p}`;
};


$('exportDatasetBtn').onclick=()=>{

    if(!requireData())return;

    exportDataset(
        state.rows,
        `${
            (
                $('usernameInput')
                    .value ||
                'user'
            ).replace(
                /\W/g,
                ''
            )||'user'
        }_dataset.csv`
    );

    toast(
        'Dataset CSV downloaded.'
    );
};


$('exportFactBtn').onclick=()=>{

    if(!state.warehouse){

        toast(
            'Build the warehouse first.'
        );

        return;
    }

    exportFact(
        state.warehouse.fact,
        `${
            (
                $('usernameInput')
                    .value ||
                'user'
            ).replace(
                /\W/g,
                ''
            )||'user'
        }_fact_table.csv`
    );

    toast(
        'Fact table CSV downloaded.'
    );
};


$('resetBtn').onclick=
    reset;

$('exportResetBtn').onclick=
    reset;


renderWarehouse();

renderDataset();

renderHistory();

updateStatus();

renderPipeline();
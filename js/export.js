import {csvDownload} from './utils.js';
export function exportDataset(rows,name='pune_food_dataset.csv'){return csvDownload(rows,name)}
export function exportFact(rows,name='pune_food_fact_order.csv'){return csvDownload(rows,name)}

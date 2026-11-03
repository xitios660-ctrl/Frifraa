'use strict';
const crypto=require('node:crypto');
const BASE_SPEED=170,MIN_SPEED=150,SPEED_GAIN=10,MAX_SPEED_LEVEL=3;
// Conditional probabilities among revealed items. Gold fire is 1%, versus 24% for a normal flame.
const DROPS=[['range',26],['bomb',22],['speed',12],['shield',9],['push',8],['kick',7],['curse',5],['maxrange',1],['life',10]];
function drop(roll=crypto.randomInt(100)){
 let offset=0;for(const [type,weight] of DROPS){offset+=weight;if(roll<offset)return type;}
 return 'maxrange';
}
module.exports={BASE_SPEED,MIN_SPEED,SPEED_GAIN,MAX_SPEED_LEVEL,DROPS,drop};

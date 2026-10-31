'use strict';
const crypto=require('node:crypto');
const BASE_SPEED=170,MIN_SPEED=150,SPEED_GAIN=5;
// Conditional probabilities among revealed items. Gold fire is 1%, versus 24% for a normal flame.
const DROPS=[['range',24],['bomb',24],['speed',12],['shield',10],['push',8],['pierce',8],['kick',8],['curse',5],['maxrange',1]];
function drop(roll=crypto.randomInt(100)){
 let offset=0;for(const [type,weight] of DROPS){offset+=weight;if(roll<offset)return type;}
 return 'maxrange';
}
module.exports={BASE_SPEED,MIN_SPEED,SPEED_GAIN,DROPS,drop};

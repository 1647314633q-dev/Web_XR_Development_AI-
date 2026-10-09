export const canDraw = (role,connected,view) => role==='guest'&&connected&&view==='remote';
export function mayReceiveAnnotation(role,own,peer,annotation,previous){
 if(role==='host')return annotation.owner===peer&&annotation.target===own;
 // The host can attach a surface position to an existing guest instruction, never create or rewrite it.
 return role==='guest'&&!!previous&&annotation.owner===own&&annotation.target===peer&&!!annotation.spatial&&annotation.revision>previous.revision&&annotation.kind===previous.kind&&annotation.text===previous.text&&annotation.source===previous.source&&JSON.stringify(annotation.points)===JSON.stringify(previous.points);
}

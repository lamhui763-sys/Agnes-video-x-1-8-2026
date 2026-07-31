const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const strToReplace = `                        })}
                      </div>
                        {activeProject.scenes.length === 0 && (`;

const correctStr = `                        })}
                      </div>
                      {activeProject.scenes.length === 0 && (`;

// wait, no, the error was because I had SceneItem inside the loop, and the loop is:
// {activeProject.scenes.map((scene, index) => {
//   return ( <div key={scene.id}> <SceneItem /> </div> ); 
// })}
// If I look at what I injected:
// return ( <div ...> <SceneItem ... /> </div> );
// })}
// </div>
// {activeProject.scenes.length === 0 && (


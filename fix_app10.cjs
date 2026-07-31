const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const strToReplace = `                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* ============ TAB: STORYBOARD SCENES KEYFRAMES & AI HUB ============ */}`;

const correctStr = `                        )}
                      </div>
                    </div>
                  </div>
              )}
              {/* ============ TAB: STORYBOARD SCENES KEYFRAMES & AI HUB ============ */}`;

code = code.replace(strToReplace, correctStr);
fs.writeFileSync('src/App.tsx', code);

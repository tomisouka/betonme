zip -r project.zip . \
  -x "node_modules/*" \
     ".git/*" \
     "dist/*" \
     "dist-tauri/*" \
     "build/*" \
     "src-tauri/target/*" \
     "*.log"
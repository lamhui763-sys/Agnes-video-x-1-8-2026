import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

async function main() {
  try {
    const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);
    console.log("Connecting to Firestore with databaseId:", config.firestoreDatabaseId);
    
    const docRef = doc(db, "projects", "all_projects");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log("SUCCESS: Found document!");
      console.log("Number of projects:", data.projects?.length);
      if (data.projects) {
        data.projects.forEach((p: any, i: number) => {
          console.log(`Project ${i + 1}: ID=${p.id}, Name="${p.name}", scenesCount=${p.scenes?.length}`);
        });
      }
    } else {
      console.log("Document projects/all_projects does not exist.");
    }
  } catch (err) {
    console.error("Error reading Firestore:", err);
  }
}

main();

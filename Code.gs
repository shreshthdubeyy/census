/**
 * Census Field App - Google Sheets Backend (Secure Tokenized Edition)
 * 
 * Column Layout in Google Sheet:
 * Column 1: Bhavan Sankhya (e.g. CN-0001)
 * Column 2: Makaan Sankhya (e.g. 0001, 0002, 0003 - globally progressive)
 * Column 3: Mukhiya ka naam
 * Column 4: Mobile No
 * Column 5: SE ID
 * Column 6: Remarks
 * Column 7: Timestamp
 */

var SHEET_NAME = "Census";
// Your explicit Spreadsheet ID from docs.google.com/spreadsheets/d/14gn4Gulfk_2jUo9-00pgsgp-6dLqqdSw3vw8KyxiFWY
var SPREADSHEET_ID = "14gn4Gulfk_2jUo9-00pgsgp-6dLqqdSw3vw8KyxiFWY";

// Secure Master Password stored completely server-side (hidden from public GitHub)
var ACCESS_PASSWORD = "8004993085";

// Helper function to get or create the Census sheet
function getCensusSheet() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    // Ignore active lookup error
  }
  
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (err) {
      throw new Error("Could not access spreadsheet: " + err.toString());
    }
  }
  
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Bhavan Sankhya", 
      "Makaan Sankhya", 
      "Mukhiya ka naam", 
      "Mobile No", 
      "SE ID", 
      "Remarks", 
      "Family Members Count",
      "Timestamp"
    ]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
  } else {
    // Self-Healing Header Migration: Verify if column header exists, else add it!
    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var hasMembersCount = false;
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] === "Family Members Count") {
        hasMembersCount = true;
        break;
      }
    }
    
    if (!hasMembersCount && lastCol >= 6) {
      // Insert "Family Members Count" at column 7 and push Timestamp to 8
      sheet.insertColumnBefore(7);
      sheet.getRange(1, 7).setValue("Family Members Count").setFontWeight("bold");
    }
  }
  return sheet;
}

// Helper to format ID padding (e.g., 5 -> "0005")
function padNumber(num, size) {
  var s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

// Parse progressive IDs from columns
function getNextIds() {
  var sheet = getCensusSheet();
  var data = sheet.getDataRange().getValues();
  
  var maxBhavanNum = 0;
  var maxMakaanNum = 0;
  
  for (var i = 1; i < data.length; i++) {
    var bhavanStr = data[i][0] || ""; 
    var makaanStr = data[i][1] || ""; 
    
    var bhavanMatch = bhavanStr.match(/CN-(\d+)/);
    if (bhavanMatch) {
      var bNum = parseInt(bhavanMatch[1], 10);
      if (bNum > maxBhavanNum) maxBhavanNum = bNum;
    }
    
    var mNum = parseInt(makaanStr, 10);
    if (!isNaN(mNum) && mNum > maxMakaanNum) {
      maxMakaanNum = mNum;
    }
  }
  
  return {
    nextBhavanId: "CN-" + padNumber(maxBhavanNum + 1, 4),
    nextMakaanId: padNumber(maxMakaanNum + 1, 4)
  };
}

/**
 * Handle HTTP GET Requests (Enforces Token Security)
 */
function doGet(e) {
  var response = {};
  
  try {
    var action = e.parameter.action;
    var password = e.parameter.password;
    
    // Gatekeeper: Reject any unsigned GET request
    if (password !== ACCESS_PASSWORD) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized access blocked." }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    var sheet = getCensusSheet();
    
    if (action === "getNextIds") {
      var ids = getNextIds();
      response = {
        success: true,
        nextBhavanId: ids.nextBhavanId,
        nextMakaanId: ids.nextMakaanId
      };
    } 
    else if (action === "getBhavanDetails") {
      var bhavanId = e.parameter.bhavanId;
      if (!bhavanId) throw new Error("Missing bhavanId parameter");
      
      var data = sheet.getDataRange().getValues();
      var results = [];
      var targetBhavan = bhavanId.trim().toUpperCase();
      
      for (var i = 1; i < data.length; i++) {
        var currentBhavan = (data[i][0] || "").toString().trim().toUpperCase();
        if (currentBhavan === targetBhavan) {
          results.push({
            bhavanId: data[i][0],
            makaanId: data[i][1],
            mukhiyaNaam: data[i][2],
            mobileNo: data[i][3],
            seId: data[i][4],
            remarks: data[i][5],
            membersCount: data[i][6], // Column 7
            timestamp: data[i][7]      // Column 8
          });
        }
      }
      response = { success: true, bhavanId: bhavanId, data: results };
    } 
    else if (action === "universalSearch") {
      var query = (e.parameter.query || "").trim().toLowerCase();
      var data = sheet.getDataRange().getValues();
      var results = [];
      
      if (query !== "") {
        // Uniform parsing helper for numeric searches (e.g. "1" -> match "CN-0001" or "0001")
        var numQuery = parseInt(query, 10);
        var paddedNumQuery = !isNaN(numQuery) ? padNumber(numQuery, 4) : "";
        var bhavanPaddedQuery = !isNaN(numQuery) ? "cn-" + paddedNumQuery : "";

        for (var i = 1; i < data.length; i++) {
          var bId = (data[i][0] || "").toString().trim().toLowerCase();
          var mId = (data[i][1] || "").toString().trim().toLowerCase();
          var name = (data[i][2] || "").toString().trim().toLowerCase();
          var mobile = (data[i][3] || "").toString().trim().toLowerCase();
          var seId = (data[i][4] || "").toString().trim().toLowerCase();
          
          var isMatch = false;
          if (bId.indexOf(query) !== -1 ||
              mId.indexOf(query) !== -1 ||
              name.indexOf(query) !== -1 ||
              mobile.indexOf(query) !== -1 ||
              seId.indexOf(query) !== -1) {
            isMatch = true;
          } else if (paddedNumQuery !== "" && (bId.indexOf(paddedNumQuery) !== -1 || mId.indexOf(paddedNumQuery) !== -1 || bId.indexOf(bhavanPaddedQuery) !== -1)) {
            isMatch = true;
          }
          
          if (isMatch) {
            results.push({
              bhavanId: data[i][0],
              makaanId: data[i][1],
              mukhiyaNaam: data[i][2],
              mobileNo: data[i][3],
              seId: data[i][4],
              remarks: data[i][5],
              membersCount: data[i][6], // Column 7
              timestamp: data[i][7]      // Column 8
            });
          }
        }
      }
      response = { success: true, query: e.parameter.query, data: results };
    } 
    else {
      throw new Error("Invalid or missing action parameter");
    }
  } catch (err) {
    response = { success: false, error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
                       .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle HTTP POST Requests (Enforces Token Security)
 */
function doPost(e) {
  var response = {};
  
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var password = postData.password;
    
    // Gatekeeper: Reject any unsigned POST request
    if (password !== ACCESS_PASSWORD) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized access blocked." }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    var sheet = getCensusSheet();
    
    // Action 1: Password authentication check (used during login card transition)
    if (action === "authenticate") {
      response = {
        success: true,
        message: "Authenticated successfully"
      };
    }
    // Action 2: Create new census entry
    else if (action === "createEntry") {
      var entries = postData.entries;
      if (!entries || entries.length === 0) throw new Error("No entries provided");
      
      var ids = getNextIds();
      var assignedBhavanId = ids.nextBhavanId;
      var currentMakaanNum = parseInt(ids.nextMakaanId, 10);
      var timestamp = new Date();
      var insertedCount = 0;
      
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var makaanVal = "'" + padNumber(currentMakaanNum, 4);
        
        sheet.appendRow([
          assignedBhavanId,
          makaanVal,
          (entry.mukhiyaNaam || "").trim(),
          (entry.mobileNo || "").trim(),
          (entry.seId || "").trim(),
          (entry.remarks || "").trim(),
          (entry.membersCount || "").toString().trim(), // Column 7
          timestamp                                      // Column 8
        ]);
        
        currentMakaanNum++;
        insertedCount++;
      }
      response = { 
        success: true, 
        bhavanId: assignedBhavanId, 
        insertedCount: insertedCount,
        message: "Entries saved successfully!"
      };
    } 
    // Action 3: Edit/Update census entries
    else if (action === "updateEntry") {
      var bhavanId = postData.bhavanId;
      var entries = postData.entries;
      
      if (!bhavanId || !entries) throw new Error("Missing bhavanId or entries for update");
      
      var data = sheet.getDataRange().getValues();
      var targetBhavan = bhavanId.trim().toUpperCase();
      var firstMatchIndex = -1;
      var matchCount = 0;
      
      for (var i = 1; i < data.length; i++) {
        var currentBhavan = (data[i][0] || "").toString().trim().toUpperCase();
        if (currentBhavan === targetBhavan) {
          if (firstMatchIndex === -1) firstMatchIndex = i + 1;
          matchCount++;
        }
      }
      
      if (firstMatchIndex !== -1 && matchCount > 0) {
        sheet.deleteRows(firstMatchIndex, matchCount);
      } else {
        firstMatchIndex = sheet.getLastRow() + 1;
      }
      
      var timestamp = new Date();
      var ids = getNextIds();
      var nextGlobalMakaanNum = parseInt(ids.nextMakaanId, 10);
      
      for (var k = 0; k < entries.length; k++) {
        var entry = entries[k];
        var makaanId = entry.makaanId;
        
        if (!makaanId || makaanId.toString().trim() === "" || makaanId === "-") {
          makaanId = padNumber(nextGlobalMakaanNum, 4);
          nextGlobalMakaanNum++;
        } else {
          makaanId = padNumber(parseInt(makaanId, 10), 4);
        }
        
        var rowData = [
          bhavanId,
          "'" + makaanId,
          (entry.mukhiyaNaam || "").trim(),
          (entry.mobileNo || "").trim(),
          (entry.seId || "").trim(),
          (entry.remarks || "").trim(),
          (entry.membersCount || "").toString().trim(), // Column 7
          timestamp                                      // Column 8
        ];
        
        sheet.insertRowBefore(firstMatchIndex + k);
        sheet.getRange(firstMatchIndex + k, 1, 1, 8).setValues([rowData]); // Column width is 8!
      }
      response = { 
        success: true, 
        bhavanId: bhavanId, 
        updatedCount: entries.length,
        message: "Entries updated successfully!"
      };
    } 
    else {
      throw new Error("Invalid or missing action parameter in POST");
    }
  } catch (err) {
    response = { success: false, error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
                       .setMimeType(ContentService.MimeType.JSON);
}

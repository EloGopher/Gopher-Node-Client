var Globals = require("../project_modules/Globals.js");
var cheerio = require('cheerio'); //https://github.com/cheeriojs/cheerio
var util = require('util');

var SocketIOHandle;

var	localFolder = __dirname + '/../liveparser-root';
localFolder = localFolder.replace(/\\/g,'/');

var	page404 = localFolder + '/404.html';

//----------------------------------------------------------------------------------------
function json2xml(o, tab) {
   var toXml = function(v, name, ind) {
      var xml = "";
      if (v instanceof Array) {
         for (var i=0, n=v.length; i<n; i++)
            xml += ind + toXml(v[i], name, ind+"\t") + "\n";
      }
      else if (typeof(v) == "object") {
         var hasChild = false;
         xml += ind + "<" + name;
         for (var m in v) {
            if (m.charAt(0) == "@")
               xml += " " + m.substr(1) + "=\"" + v[m].toString() + "\"";
            else
               hasChild = true;
         }
         xml += hasChild ? ">" : "/>";
         if (hasChild) {
            for (var m in v) {
               if (m == "#text")
                  xml += v[m];
               else if (m == "#cdata")
                  xml += "<![CDATA[" + v[m] + "]]>";
               else if (m.charAt(0) != "@")
                  xml += toXml(v[m], m, ind+"\t");
            }
            xml += (xml.charAt(xml.length-1)=="\n"?ind:"") + "</" + name + ">";
         }
      }
      else {
         xml += ind + "<" + name + ">" + v.toString() +  "</" + name + ">";
      }
      return xml;
   }, xml="";
   for (var m in o)
      xml += toXml(o[m], m, "");
   return tab ? xml.replace(/\t/g, tab) : xml.replace(/\t|\n/g, "");
}


//----------------------------------------------------------------------------------------
function recurse(TreeHTML, key, val) 
{
//		list += "<li>";
	if (val instanceof Object) {

		if (key=="loc")
		{
//			TreeHTML += key + "<ul>";
			TreeHTML += "<li><a>"+ key + "</a><ul>";
			Object.keys(val).forEach(function(key) {  TreeHTML = recurse(TreeHTML, key, val[key] ); } );
			TreeHTML += "</ul>";
		} else
		{
			TreeHTML += "<li><a>"+ key + "</a><ul>";
			Object.keys(val).forEach(function(key) {  TreeHTML = recurse(TreeHTML, key, val[key] ); } );
			TreeHTML += "</ul></li>";
		}
	} else {
//		if (key=="start") {} else
//		if (key=="end") {} else
		{
			TreeHTML +=  "<li><a>" + key +  " = " + val + "</a></li>";
		}

		if ( (key=="type") && (val=="AssignmentExpression") )
		{
			SaveAssignment = true;
		}
	}
	return TreeHTML;
//		list += "</li>";
}


//----------------------------------------------------------------------------------------
function parseAssignmentExpression(VarObj)
{
	var NewQ = new Object();
	NewQ.Type = "AssignmentExpression";
	NewQ.XLine = VarObj.find("loc").find("end").find("line").first().text();
	NewQ.XColumn = VarObj.find("loc").find("end").find("column").first().text();
	NewQ.XStartPosition = parseInt(VarObj.find("start").first().text(),10);
	NewQ.XEndPosition = parseInt(VarObj.find("end").first().text(),10);
	
	var jQuery = cheerio.load(VarObj, {xmlMode: true});
	NewQ.VarNames = [];
	jQuery(VarObj).children("expressions").each(function(){
		
		if (jQuery(this).find("type").first().text()=="AssignmentExpression")
		{
			NewQ.VarNames.push( jQuery(this).find("left").find("name").first().text() );
		}
	});

	return NewQ;
}


//----------------------------------------------------------------------------------------
function MakeJSONTreeFromJS(contents,EmitData)
{
	var options = {};
	options.locations = true; 
	var compact = false;
	var ExpressionPoint;
	var jQuery;
	var TreeHTML2;
	var parsed;

	var SourceCode = contents.toString();

	parsed = Globals.acorn.parse(contents, options); 	
	//console.log(JSON.stringify(parsed, null, compact ? null : 2));

	if (EmitData)
	{
		TreeHTML2 = "<ul>";
		Object.keys(parsed).forEach(function(key) {  TreeHTML2 = recurse(TreeHTML2, key, parsed[key] ); } );
		TreeHTML2 += "</ul>";

		Globals.socketServer.sockets.in("room1").emit('UpdateTreeView',{	htmlcode:'<div class="tree" style="width:1200px">'+TreeHTML2+'</div>' });
	}
// TODO: escape characters that will break the conversion from JSON to XML
//						parsed = parsed.replace(/</g,'&lt;');
//						parsed = parsed.replace(/>/g,'&gt;');
	
	return parsed;
}


//----------------------------------------------------------------------------------------
function parseBinaryExpression(VarObj)
{
	var NewQ = new Object();
	NewQ.Type = "BinaryExpression";
	NewQ.XLine = VarObj.find("loc").find("start").find("line").first().text();
	NewQ.XColumn = VarObj.find("loc").find("start").find("column").first().text();
	NewQ.XStartPosition = parseInt(VarObj.find("start").first().text(),10);
	NewQ.XEndPosition = parseInt(VarObj.find("end").first().text(),10);

	NewQ.LeftSideName = VarObj.find("left").find("name").first().text();
	NewQ.LeftSideType = VarObj.find("left").find("type").first().text();
	NewQ.LeftSideValue = "";
	if (NewQ.LeftSideType == "Literal")
	{
		NewQ.LeftSideValue = VarObj.find("left").find("value").first().text();
	}
	
	NewQ.Xoperator = VarObj.find("operator").first().text();
	
	NewQ.RightSideName = VarObj.find("right").find("name").first().text();
	NewQ.RightSideType = VarObj.find("right").find("type").first().text();
	NewQ.RightSideValue = "";
	if (NewQ.RightSideType == "Literal")
	{
		NewQ.RightSideValue = VarObj.find("right").find("value").first().text();
	}
	
	return NewQ;
}


//----------------------------------------------------------------------------------------
function parseForStatement(VarObj)
{
	var NewQ = new Object();
	NewQ.Type = "ForStatement";
	NewQ.XLine = VarObj.find("loc").find("start").find("line").first().text();
	NewQ.XColumn = VarObj.find("loc").find("start").find("column").first().text();
	NewQ.XStartPosition = parseInt(VarObj.find("start").first().text(),10);

//	console.log("loop:"+VarObj.find("body").first().find("start").first().text());
	NewQ.XBodyStartPosition = parseInt(VarObj.find("body").first().find("start").first().text(),10);

	NewQ.InitName = "null";

	if (VarObj.find("init").find("type").first().text() == "AssignmentExpression")
	{
		var parentNode2 = VarObj.find("init");
		var NewQ2 = parseAssignmentExpression(parentNode2);

		NewQ.InitName = NewQ2.VarName;
	} else
	if (VarObj.find("init").find("type").first().text() == "VariableDeclaration")
	{
		/*
		var parentNode2 = VarObj.find("init").find("declarations").first();
		var NewQ2 = parseVariableDeclaration(parentNode2);
		
		if (NewQ2.Vars.length>0) {
			NewQ.InitName = NewQ2.Vars[0].VarName;
		}
		*/
	}

	if (VarObj.find("test").find("type").first().text() == "BinaryExpression")
	{
		var parentNode2 = VarObj.find("test").first();
		var NewQ2 = parseBinaryExpression(parentNode2);

		NewQ.TestLeftSideName = NewQ2.LeftSideName;
		NewQ.TestLeftSideType = NewQ2.LeftSideType;
		NewQ.TestLeftSideValue = NewQ2.LeftSideValue;

		NewQ.TestOperator = NewQ2.Xoperator;

		NewQ.TestRightSideName = NewQ2.RightSideName;
		NewQ.TestRigthSideType = NewQ2.RightSideType;
		NewQ.TestRightSideValue = NewQ2.RightSideValue;
	}
	
	return NewQ;
}

//----------------------------------------------------------------------------------------
function parseFunctionDeclaration(VarObj)
{
	var NewQ = new Object();
	NewQ.Type = "FunctionDeclaration";
	NewQ.XLine = VarObj.find("loc").find("start").find("line").first().text();
	NewQ.XColumn = VarObj.find("loc").find("start").find("column").first().text();
	NewQ.XStartPosition = parseInt(VarObj.find("start").first().text(),10);
	NewQ.VarName = VarObj.find("id").find("name").first().text();

	NewQ.VarParameters = [];
	
	var jQuery = cheerio.load(VarObj, {xmlMode: true});

	jQuery(VarObj).children("params").each(function(){
		NewQ.VarParameters.push(jQuery(this).find("name").text());
		//console.log( jQuery(this).find("name").text() );
	});

	return NewQ;
}


//----------------------------------------------------------------------------------------
function loopBody(tree,parentType,Xlevel,JSGopherObjectsArray,ParentName,sourcecode)
{
	var i=0;
	Xlevel++;
	
	var RecursiveParentName = ParentName;
	
	var jQuery = cheerio.load(tree, {xmlMode: true});
	
	jQuery(tree).children('body').each(function(){
		var BodyType = jQuery(this).find("type").first().text();
//		console.log('l:'+Xlevel+', t:'+BodyType+', p:'+ parentType +', b:'+jQuery(this).find('body').length);
		
		
		Globals.socketServer.sockets.in("room1").emit('UpdateParserView',{
			htmlcode:'l:'+Xlevel+', b:'+jQuery(this).children('body').length +' p:'+ parentType +', t:'+BodyType+'<br>'
		});
		//------------------------------------------------------------------------------------------------

		if (BodyType == "ReturnStatement")
		{
			var parentNode =jQuery(this);
			//console.log( parseInt(parentNode.find("start").first().text(),10) );
			var NewQ = new Object();
			NewQ.Type = "ReturnStatement";
			NewQ.XLine = parentNode.find("loc").find("start").find("line").first().text();
			NewQ.XColumn = parentNode.find("loc").find("start").find("column").first().text();
			NewQ.XStartPosition = parseInt(parentNode.find("start").first().text(),10);
			NewQ.XEndPosition = parseInt(parentNode.find("end").first().text(),10);

			NewQ.parentID = ParentName;

			JSGopherObjectsArray.push(NewQ); 
		}
		
		if (BodyType == "ForStatement")
		{
			JSGopherObjectsArray.LoopCounter++;
			var parentNode =jQuery(this);
			NewQ = parseForStatement(parentNode);
			NewQ.parentID = ParentName;
			JSGopherObjectsArray.push(NewQ);
			RecursiveParentName = ParentName + " / " + "l"+JSGopherObjectsArray.LoopCounter;
		}

		if (BodyType == "FunctionDeclaration")
		{
			JSGopherObjectsArray.FunctionCounter++;
			var parentNode =jQuery(this);
			NewQ = parseFunctionDeclaration(parentNode);
			NewQ.parentID = ParentName;
			JSGopherObjectsArray.push(NewQ);
			RecursiveParentName = ParentName + " / " + "f"+ JSGopherObjectsArray.FunctionCounter +"("+NewQ.VarName+")";
		}
		
		  
		 //** TRY PUTTING THE INDEPENDANT LOOPS BACK IN HERE SO PARENT TRACKING CAN WORK...
		 
		if (BodyType == "VariableDeclaration")
		{
			jQuery(this).find('type').each(function(){
				var BodyType2 = jQuery(this).first().text();
				if (BodyType2 == "VariableDeclarator")
				{
					var VarStart = parseInt(jQuery(this).parent().find("init").find("start").first().text(),10);
					var VarEnd = parseInt(jQuery(this).parent().find("init").find("end").first().text(),10); 

					if (jQuery(this).parent().find("init").first().text() == "")
					{
						JSGopherObjectsArray.VarDeclTrackID++;

						var NewQ = new Object();
						NewQ.Type = "VariableDeclaratorNull";
						NewQ.XLine = jQuery(this).parent().find("loc").find("end").find("line").first().text();
						NewQ.XColumn = jQuery(this).parent().find("loc").find("end").find("column").first().text();
						NewQ.XStartPosition = parseInt(jQuery(this).parent().find("start").first().text(),10);
						NewQ.XEndPosition = parseInt(jQuery(this).parent().find("end").first().text(),10);
						NewQ.VarName = jQuery(this).parent().find("id").find("name").first().text();
						NewQ.VarSource = "null";
						NewQ.DeclStart = parseInt(jQuery(this).parent().find("end").first().text(),10);
						NewQ.DeclEnd = parseInt(jQuery(this).parent().find("end").first().text(),10);
						NewQ.VarDeclTrackID = JSGopherObjectsArray.VarDeclTrackID;
						NewQ.parentID = ParentName;
						JSGopherObjectsArray.push( NewQ );

						console.log("Var Dec Null: --------- Name:" + jQuery(this).parent().find("id").find("name").first().text()  );
					}

					if (!isNaN(VarStart))
					{
						JSGopherObjectsArray.VarDeclTrackID++;

						var NewQ = new Object();
						NewQ.Type = "VariableDeclarator";
						NewQ.XLine = jQuery(this).parent().find("loc").find("end").find("line").first().text();
						NewQ.XColumn = jQuery(this).parent().find("loc").find("end").find("column").first().text();
						NewQ.XStartPosition = parseInt(jQuery(this).parent().find("start").first().text(),10);
						NewQ.XEndPosition = parseInt(jQuery(this).parent().find("end").first().text(),10);
						NewQ.VarName = jQuery(this).parent().find("id").find("name").first().text();
						NewQ.VarSource = sourcecode.slice(VarStart,VarEnd);
						NewQ.DeclStart = VarStart;
						NewQ.DeclEnd = VarEnd;
						NewQ.VarDeclTrackID = JSGopherObjectsArray.VarDeclTrackID;
						NewQ.parentID = ParentName;
						JSGopherObjectsArray.push( NewQ );

						console.log("Var Dec: --------- Name:" + jQuery(this).parent().find("id").find("name").first().text() +  " Init:" + VarStart + " " + VarEnd + " " + sourcecode.slice(VarStart,VarEnd)  );
					}
				}
			});
		}
		
		
		if (BodyType == "ExpressionStatement")
		{
			jQuery(this).find('type').each(function(){
				var BodyType2 = jQuery(this).first().text();
				if (BodyType2 == "AssignmentExpression")
				{
					var VarStart = parseInt(jQuery(this).parent().find("right").find("start").first().text(),10);
					var VarEnd = parseInt(jQuery(this).parent().find("right").find("end").first().text(),10); 

					if (!isNaN(VarStart))
					{
						JSGopherObjectsArray.VarDeclTrackID++;
						var NewQ = new Object();
						NewQ.XLine = jQuery(this).parent().find("loc").find("end").find("line").first().text();
						NewQ.XColumn = jQuery(this).parent().find("loc").find("end").find("column").first().text();
						NewQ.XStartPosition = parseInt(jQuery(this).parent().find("start").first().text(),10);
						NewQ.XEndPosition = parseInt(jQuery(this).parent().find("end").first().text(),10);
						NewQ.Type = "AssignmentExpression";
						
						NewQ.VarName = jQuery(this).parent().find("left").find("name").first().text();
						NewQ.VarOperator = jQuery(this).parent().find("operator").first().text();
						NewQ.VarSource = sourcecode.slice(VarStart,VarEnd);
						NewQ.DeclStart = VarStart;
						NewQ.DeclEnd = VarEnd;
						NewQ.VarDeclTrackID = JSGopherObjectsArray.VarDeclTrackID;
						NewQ.parentID = ParentName;
						JSGopherObjectsArray.push( NewQ );

						console.log("Assignment Expression: --------- Name:" + jQuery(this).parent().find("left").find("name").first().text() +  " Init:" + VarStart + " " + VarEnd + " " + sourcecode.slice(VarStart,VarEnd)  );
					}
				}
			});
		}
		
		 

		//------------------------------------------------------------------------------------------------
		
		//if this node has a body inside loop it 
		if ( jQuery(this).children('body').length > 0)
		{
			loopBody(this,parentType+" --> "+BodyType,Xlevel,JSGopherObjectsArray,RecursiveParentName,sourcecode);
		}
	});
	return JSGopherObjectsArray;
}

//----------------------------------------------------------------------------------------
function loopFunctionCalls(tree,sourcecode)
{
	var JSGopherFuctionCallArray = [];
	var jQuery = cheerio.load(tree, {xmlMode: true});
	
	jQuery(tree).find('type').each(function(){
		var BodyType = jQuery(this).first().text();
		if (BodyType == "CallExpression")
		{
			var CalleType  = jQuery(this).parent().find("callee").find("type").first().text();
			var CalleName  = jQuery(this).parent().find("callee").find("name").first().text();
			var CalleStart = parseInt(jQuery(this).parent().find("start").first().text(),10);
			var CalleEnd   = parseInt(jQuery(this).parent().find("end").first().text(),10);
			var CalleLine  = jQuery(this).parent().find("loc").find("start").find("line").first().text()
			var CalleParamCount = 0;
			jQuery(this).parent().children("arguments").each(function(){ CalleParamCount++;});
			
			if ( (CalleType == "Identifier") && (CalleName!="$") && (CalleName!="GopherTell") && (CalleName!="GopherVarDecl") && (CalleName!="GopherAssignment") )
			{
				
				console.log("FUNCTION: "+ sourcecode.slice(CalleStart,CalleEnd) + " - " + BodyType + " - " + CalleLine +" - "+CalleName+" - "+CalleEnd+" - "+CalleParamCount);
				var NewQ = new Object();
				NewQ.CalleLine = CalleLine;
				NewQ.CalleEnd = CalleEnd;
				NewQ.CalleParamCount = CalleParamCount;
				JSGopherFuctionCallArray.push(NewQ); 
			}
		}
	});

	return JSGopherFuctionCallArray;
}


//----------------------------------------------------------------------------------------
function escapeSingleQuuote (inStr) {
    return String(inStr).replace(/\'/g, "\\'");
}

//----------------------------------------------------------------------------------------
function InsertGopherTells(contents,JSGopherObjectsArray)
{
	//insert gohper tells starting for the end going backwards so position data doesnt change
	var nCount = JSGopherObjectsArray.length;
	while ( nCount > 0)
	{
		nCount--;

		//========================================
		if (JSGopherObjectsArray[nCount].Type == "ReturnStatement")
		{
			var returnstr = contents.slice(JSGopherObjectsArray[nCount].XStartPosition,JSGopherObjectsArray[nCount].XEndPosition);

			returnstr = returnstr.replace("return","var returnstr = " );

			var GopherTellInsert = returnstr + " GopherTell("+ JSGopherObjectsArray[nCount].XLine + ",'<b>Return:</b>'+ returnstr + '','"+ JSGopherObjectsArray[nCount].parentID  +"',GopherCallerID); return returnstr;";

			contents = 
				[contents.slice(0, JSGopherObjectsArray[nCount].XStartPosition), 
				GopherTellInsert , 
				contents.slice(JSGopherObjectsArray[nCount].XEndPosition)].join('');
		}
		
		//========================================
		if (JSGopherObjectsArray[nCount].Type == "VariableDeclarator")
		{
			var GopherTellInsert = "GopherVarDecl("+ JSGopherObjectsArray[nCount].XLine + 
											"," + JSGopherObjectsArray[nCount].VarDeclTrackID + 
											",'" + JSGopherObjectsArray[nCount].VarName+"'," + 
											JSGopherObjectsArray[nCount].VarSource + "," + 
											"'" + escapeSingleQuuote(JSGopherObjectsArray[nCount].VarSource) + "','"+ 
							JSGopherObjectsArray[nCount].parentID  +"',GopherCallerID)";

			//console.log(GopherTellInsert);

			contents = 
				[contents.slice(0, JSGopherObjectsArray[nCount].DeclStart), 
				GopherTellInsert , 
				contents.slice(JSGopherObjectsArray[nCount].DeclEnd)].join('');
		}

		//========================================
		if (JSGopherObjectsArray[nCount].Type == "VariableDeclaratorNull")
		{
			var GopherTellInsert = "=GopherVarDecl("+ JSGopherObjectsArray[nCount].XLine + 
											"," + JSGopherObjectsArray[nCount].VarDeclTrackID + 
											",'" + JSGopherObjectsArray[nCount].VarName+"'," + 
											JSGopherObjectsArray[nCount].VarSource + "," + 
											"'" + escapeSingleQuuote(JSGopherObjectsArray[nCount].VarSource) + "','"+ 
							JSGopherObjectsArray[nCount].parentID  +"',GopherCallerID)";

			//console.log(GopherTellInsert);

			contents = 
				[contents.slice(0, JSGopherObjectsArray[nCount].DeclStart), 
				GopherTellInsert , 
				contents.slice(JSGopherObjectsArray[nCount].DeclEnd)].join('');
		}

		//========================================
		if (JSGopherObjectsArray[nCount].Type == "AssignmentExpression")
		{
			var GopherTellInsert = "GopherAssignment("+ JSGopherObjectsArray[nCount].XLine + 
							"," + JSGopherObjectsArray[nCount].VarDeclTrackID + 
							",'" + JSGopherObjectsArray[nCount].VarName+"'," + 
							JSGopherObjectsArray[nCount].VarSource + "," + 
							"'" + escapeSingleQuuote(JSGopherObjectsArray[nCount].VarSource) + "','"+ 
							JSGopherObjectsArray[nCount].parentID  +"',GopherCallerID,'" + JSGopherObjectsArray[nCount].VarOperator + "')";

			//console.log(GopherTellInsert);

			contents = 
				[contents.slice(0, JSGopherObjectsArray[nCount].DeclStart), 
				GopherTellInsert , 
				contents.slice(JSGopherObjectsArray[nCount].DeclEnd)].join('');
		}
		
		//========================================
		if (JSGopherObjectsArray[nCount].Type == "ForStatement")
		{
			
			/*
			 * will not need this because the test part of loop will become a function
			var GopherTellInsert = "\nGopherTell("+ JSGopherObjectsArray[nCount].XLine + ",'" +
							"<b>For Loop</b> var:"+ JSGopherObjectsArray[nCount].InitName + 
							", value:'+"+ JSGopherObjectsArray[nCount].InitName + "+'', '" +
							JSGopherObjectsArray[nCount].parentID  +"',GopherCallerID);\n"; 
		
			contents = [contents.slice(0, JSGopherObjectsArray[nCount].XBodyStartPosition+1), GopherTellInsert , contents.slice(JSGopherObjectsArray[nCount].XBodyStartPosition+1)].join('');
			*/
/*			
			var GopherTellInsert = "GopherTell("+ JSGopherObjectsArray[nCount].XLine + ",'" +
							"<b>For Loop Init</b> [name:"+ JSGopherObjectsArray[nCount].InitName + 
							"] test[ operator["+ JSGopherObjectsArray[nCount].TestOperator +
							"] left[name:"+ JSGopherObjectsArray[nCount].TestLeftSideName + 
							", type:"+ JSGopherObjectsArray[nCount].TestLeftSideType + 
							", value:"+ JSGopherObjectsArray[nCount].TestLeftSideValue + 
							"] right[name:"+ JSGopherObjectsArray[nCount].TestRightSideName + 
							", type:"+ JSGopherObjectsArray[nCount].TestRigthSideType + 
							", value:"+ JSGopherObjectsArray[nCount].TestRightSideValue + "] ]','"+ 
							JSGopherObjectsArray[nCount].parentID  +"',GopherCallerID);\n"; 
*/
			var GopherTellInsert = "GopherTell("+ JSGopherObjectsArray[nCount].XLine + ",'<b>For Loop Init</b>','"+ 
							JSGopherObjectsArray[nCount].parentID  +"',GopherCallerID); "; 

			contents = [contents.slice(0, JSGopherObjectsArray[nCount].XStartPosition), GopherTellInsert , contents.slice(JSGopherObjectsArray[nCount].XStartPosition)].join('');
		}

		//========================================
		if (JSGopherObjectsArray[nCount].Type == "FunctionDeclaration")
		{
			var ParamsText = "";
			var ParamsValue = "";
			for (var pcounter=0; pcounter< JSGopherObjectsArray[nCount].VarParameters.length; pcounter++ )
			{
				ParamsText += JSGopherObjectsArray[nCount].VarParameters[pcounter] + ", ";
				ParamsValue += "'+" + JSGopherObjectsArray[nCount].VarParameters[pcounter] + "+', ";
			}

			var tempstring = contents.substring(JSGopherObjectsArray[nCount].XStartPosition);

			var FirstCurleyBracket = tempstring.indexOf("{");

			var GopherTellInsert = " var GopherCallerID = arguments.length ? arguments[arguments.length - 1] : 'default';"+
" GopherTell("+ JSGopherObjectsArray[nCount].XLine + ",'<b>Function Run</b> ["+JSGopherObjectsArray[nCount].VarName+"] parameters:"+ ParamsText +" values: "+ParamsValue+"','"+ JSGopherObjectsArray[nCount].parentID +"',GopherCallerID);";

			contents = 
				[contents.slice(0, JSGopherObjectsArray[nCount].XStartPosition+FirstCurleyBracket+1), 
				GopherTellInsert, 
				contents.slice(JSGopherObjectsArray[nCount].XStartPosition+FirstCurleyBracket+1)].join('');
		}	
	}
	return contents;
}

function LoopLeft(tree,sourcecode,indent)
{
	var jQuery = cheerio.load(tree, {xmlMode: true});
	
	jQuery(tree).children().each(function(){
		
		var xstr = "";
		var xtrue = false;
		for (var i=0; i<indent; i++) { xstr += "  "; }
		

		if ( (jQuery(this)[0]["name"]=="left" )  )
		{
			
			var CalleLine = jQuery(this).parent().find("loc").find("start").find("line").first().text()
			var LeftSide = sourcecode.slice( parseInt( jQuery(this).parent().children('left').first().find("start").first().text() , 10)  , 
													 parseInt( jQuery(this).parent().children('left').first().find("end").first().text() , 10) );

			var RightSide = sourcecode.slice( parseInt( jQuery(this).parent().children('right').first().find("start").first().text() , 10)  , 
													  parseInt( jQuery(this).parent().children('right').first().find("end").first().text() , 10) );

			var xOperator = jQuery(this).parent().children('operator').first().text(); 
			
			var xType = jQuery(this).find('type').first().text(); 
			

			var TempX = jQuery(this).parent();
			var ParentType = TempX.text("")[0]["name"];

			if ( (xOperator=="==") || (xOperator=="===") || (xOperator=="!=") || (xOperator=="!==") || (xOperator==">") || (xOperator==">=") || (xOperator=="<") || (xOperator=="<=") || (xOperator=="&&") || (xOperator=="||") || (xOperator=="!") )
			{
				if (xType=="BinaryExpression") {
					console.log(xstr+"LEFT-RIGTH(P): "+CalleLine+" L:"+LeftSide+" O:"+xOperator+" R:"+RightSide+" P:"+ParentType);
				} else
				{
					console.log(xstr+"LEFT-RIGTH: "+CalleLine+" L:"+LeftSide+" O:"+xOperator+" R:"+RightSide+" P:"+ParentType);
				}
			}
		}
		
		if ( jQuery(this).children().length  > 0)
		{
			LoopLeft(this,sourcecode,indent+1);
		}
	});
	/*
	
	jQuery(xmldata).find('left').each(function(){
		var BodyType = jQuery(this).parent().find("type").first().text();

		var CalleLine = jQuery(this).parent().find("loc").find("start").find("line").first().text()
		var LeftSide = contents.slice( parseInt( jQuery(this).parent().children('left').first().find("start").first().text() , 10)  , 
												 parseInt( jQuery(this).parent().children('left').first().find("end").first().text() , 10) );

		var RightSide = contents.slice( parseInt( jQuery(this).parent().children('right').first().find("start").first().text() , 10)  , 
												  parseInt( jQuery(this).parent().children('right').first().find("end").first().text() , 10) );

		var xOperator = jQuery(this).parent().children('operator').first().text(); 

		var TempX = jQuery(this).parent();
		var ParentType = TempX.text("")[0]["name"];

		if (xOperator!="=")
		{
			console.log("LEFT-RIGTH: "+BodyType+" "+CalleLine+" L:"+LeftSide+" O:"+xOperator+" R:"+RightSide+" P:"+ParentType);
		}
	});
	*/
	

}

//----------------------------------------------------------------------------------------
//helper function handles file verification for the client files that will be converted
this.getFile = function(request, response)
{
	var fileName = request.url;
	if ((request.url=="") || (request.url=="/")) { fileName = '/index.html'; }
	
	var	ext = Globals.path.extname(fileName);
	var mimeType = Globals.extensions[ext];
	
	if(!Globals.extensions[ext]){ //do we support the requested file type?
		//for now just send a 404 and a short message
		response.writeHead(404, {'Content-Type': 'text/html'});
		response.end("<html><head></head><body>The requested file type is not supported</body></html>");
	};

	var filePath = localFolder+fileName;
//	console.log("file:"+fileName+" url:"+request.url+" ext:"+ext+" filePath:"+filePath);

	Globals.fs.exists(filePath,function(exists)
	{
		//if it does...
		if(exists){
			Globals.fs.readFile(filePath,function(err,contents){
				if(!err){
					if ( (mimeType=="application/javascript") && 
							 (filePath.indexOf("jquery")==-1) ) //if javascript file try parsing it
					{
						
						//use https://github.com/balupton/jquery-syntaxhighlighter for highlighting
						Globals.socketServer.sockets.in("room1").emit('UpdateSourceView',{	sourcecode:'<pre class="language-javascript">'+contents+'</pre>' });
						
						///----------------------------------------------------------------------------
						var parsed = MakeJSONTreeFromJS(contents,true);
						var xmldata = "<project>"+ json2xml(parsed)+ "</project>";

						/* LOOP EXPERIMENT
						var jQuery = cheerio.load(xmldata, {xmlMode: true});
						var i = 0;
						jQuery(xmldata).find("type").each(function(){
							i++;
							console.log(i+" "+jQuery(this).text());
							if (i==2) { console.log( util.inspect( jQuery(this) ) );  }
						});
						*/
						
						
						LoopLeft(xmldata,contents,0,false);

						var JSGopherObjectsArray = [];
						JSGopherObjectsArray.FunctionCounter = 0;
						JSGopherObjectsArray.LoopCounter = 0;
						JSGopherObjectsArray.VarDeclTrackID = 0;
						JSGopherObjectsArray = loopBody(xmldata,"BODY",0,JSGopherObjectsArray,"body",contents);

						contents = InsertGopherTells(contents,JSGopherObjectsArray);
						
						//-------------------------------- INSERT EXTRA PARAMETER TO ALL FUNCTIONS
						var parsed = MakeJSONTreeFromJS(contents,false);
						var xmldata = "<project>"+ json2xml(parsed)+ "</project>";
						var JSGopherFuctionCallArray = [];

						JSGopherFuctionCallArray = loopFunctionCalls(xmldata,contents);
						
						var nCount = JSGopherFuctionCallArray.length;
						while ( nCount > 0)
						{
							nCount--;

							var GopherTellInsert = "";
							if (JSGopherFuctionCallArray[nCount].CalleParamCount>0)
							{
								GopherTellInsert = ",";
							}
							GopherTellInsert += "'" + JSGopherFuctionCallArray[nCount].CalleLine + ":'+(GopherCallerIDCouter++)";
							//console.log(GopherTellInsert);
							
							contents = 
								[contents.slice(0, JSGopherFuctionCallArray[nCount].CalleEnd-1), 
								GopherTellInsert , 
								contents.slice(JSGopherFuctionCallArray[nCount].CalleEnd-1)].join('');
						}	
						Globals.fs.writeFile(filePath+".funcdec.temp",contents);
						
						//========================================
						//Insert the gohper callback fuctions and socket.io setup
						contents =	"//GopherB node Socket setup \n"+
												"var iosocket;\n"+
												"iosocket = io.connect();\n"+
												"iosocket.emit('HiGopherB','');\n"+
												"iosocket.emit('HiClientServer','');\n"+
												"\n\n" +
												"var GopherCallerIDCouter = 100;\n"+
												"var GopherCallerID = '0:0';\n"+


												"function GopherTell(xCodeLine, xGopherMsg, xParentID, xGopherCallerID) {\n" +
												" iosocket.emit( 'Gopher.Tell', {CodeLine:xCodeLine, GopherMsg:xGopherMsg, ParentID:xParentID, GopherCallerID:xGopherCallerID } );\n"+
												"}\n\n"+

												"//------------------------------------------------------------------------------\n"+
												"function GopherVarDecl(xCodeLine, xVarDeclTrackID, xVarName, xVarValue, xVarStr, xParentID, xGopherCallerID ) {\n" +
												" iosocket.emit( 'Gopher.VarDecl', {CodeLine:xCodeLine, VarDeclTrackID:xVarDeclTrackID, VarName:xVarName, VarValue:xVarValue, VarStr:xVarStr, ParentID:xParentID, GopherCallerID:xGopherCallerID } );\n"+
												"return xVarValue;\n"+
												"}\n\n"+

												"//------------------------------------------------------------------------------\n"+
												"function GopherAssignment(xCodeLine, xVarDeclTrackID, xVarName, xVarValue, xVarStr, xParentID, xGopherCallerID, xVarOperator, VarOperator ) {\n" +
												" iosocket.emit( 'Gopher.GopherAssignment', {CodeLine:xCodeLine, VarDeclTrackID:xVarDeclTrackID, VarName:xVarName, VarValue:xVarValue, VarStr:xVarStr, ParentID:xParentID, GopherCallerID:xGopherCallerID, VarOperator:xVarOperator } );\n"+
												"return xVarValue;\n"+
												"}\n\n"+

												"//------------------------------------------------------------------------------\n"+
												"function GopherFunctionCall(xCodeLine, xFuncTrackID, xFuncStr, xFuncValue, xParentID, xGopherCallerID) {\n" +
												" iosocket.emit( 'Gopher.FuncCall', {CodeLine:xCodeLine, FuncTrackID:xFuncTrackID, VarStr:xFuncStr, FuncValue:xFuncValue, ParentID:xParentID, GopherCallerID:xGopherCallerID } );\n"+
												"return xFuncValue;\n"+
												"}\n\n"+

												"//------------------------------------------------------------------------------\n"+
												"\n\n"+
												contents;

						

						response.writeHead(200,{ "Content-type" : mimeType, "Content-Length" : contents.length });
						response.end(contents);
					}	else
					{
						response.writeHead(200,{ "Content-type" : mimeType, "Content-Length" : contents.length });
						response.end(contents);
					}
				} else {
					//for our own troubleshooting
					console.dir(err);
				}
			});
		} else 
		{
			//if the requested file was not found serve-up our custom 404 page
			Globals.fs.readFile(page404,function(err,contents){
				if(!err){
						response.writeHead(404, {'Content-Type': 'text/html'});
						response.end(contents);
				} else {
						//for our own troubleshooting
						console.dir(err);
				};
			});
		}
	});
}


//----------------------------------------------------------------------------------------
this.InitLocalSocket = function(socket){

	console.log("Call binding Client Server socket");

	SocketIOHandle = socket; // store socket so we can use it in the rest of the module

	socket.on('HiClientServer', function(data) {
		console.log("HiClientServer called from client: "+socket.id);

		Globals.socketServer.sockets.in("room1").emit('HiClient', { text:"this is from Gopher Client Server"});
	});
		

}

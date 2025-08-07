const type = {REG: "REG", GP_REG: "GP_REG", IMM: "IMM", REGI: "REGI", ADR: "ADR", COND: "COND"};
const INSTRUCTIONS = [
	{oper: "PUSH", args: [type.GP_REG],            prefix: "100010"},
	{oper: "POP",  args: [type.GP_REG],            prefix: "100011"},
	{oper: "INC",  args: [type.GP_REG],            prefix: "100001"},
	{oper: "DEC",  args: [type.GP_REG],            prefix: "100100"},
	{oper: "ADD",  args: [type.GP_REG],            prefix: "100101"},
	{oper: "SUB",  args: [type.GP_REG],            prefix: "100110"},
	{oper: "NEG",  args: [],                       prefix: "10101111"},
	{oper: "SRL",  args: [],                       prefix: "10110000"},
	{oper: "SRA",  args: [],                       prefix: "10110001"},
	{oper: "SLA",  args: [],                       prefix: "10110010"},
	{oper: "NOP",  args: [],                       prefix: "00000000"},
	{oper: "RET",  args: [],                       prefix: "10110101"},
	{oper: "CALL", args: [type.IMM],               prefix: "10110100"},
	{oper: "DJNZ", args: [type.IMM],               prefix: "10110110"},
	{oper: "AND",  args: [type.GP_REG],            prefix: "101000"},
	{oper: "AND",  args: [type.IMM],               prefix: "10101100"},
	{oper: "OR",   args: [type.GP_REG],            prefix: "101001"},
	{oper: "OR",   args: [type.IMM],               prefix: "10101101"},
	{oper: "XOR",  args: [type.GP_REG],            prefix: "101010"},
	{oper: "XOR",  args: [type.IMM],               prefix: "10101110"},
	{oper: "JUMP", args: [type.IMM],               prefix: "10110111"},
	{oper: "JUMP", args: [type.COND, type.IMM],    prefix: "10111"},
	{oper: "LD",   args: [type.REG, type.REG],     prefix: "11"},
	{oper: "LD",   args: [type.REGI, type.GP_REG], prefix: "010"},
	{oper: "LD",   args: [type.GP_REG, type.REGI], prefix: "011"},
	{oper: "LD",   args: [type.GP_REG, type.IMM],  prefix: "100000"},
	{oper: "LD",   args: [type.ADR, type.GP_REG],  prefix: "001000"},
	{oper: "LD",   args: [type.GP_REG, type.ADR],  prefix: "001001"},
];
const GP_REG_ENC = {"A": "00", "B": "01", "C": "10", "D": "11"};
const REG_ENC = {"A": "001", "B": "010", "C": "011", "D": "100", "F": "101", "PC": "110", "SP": "111"};
const COND_ENC = {"C": "001", "NC": "010", "Z": "011", "NZ": "100", "S": "101", "NS": "110"};
const GP_REG_DEC = {"00": "A", "01": "B", "10": "C", "11": "D"};
const REG_DEC = {"001": "A", "010": "B", "011": "C", "100": "D", "101": "F", "110": "PC", "111": "SP"};
const flags = {zero: 1, carry: 16, sign: 8};

var registers = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0, "PC": 0, "SP": 127};

var Range = ace.require('ace/range').Range;
var memory = {data: null, lineNum: null};
var cpu, help, editor;
var showHelp = false;
var timerID = 0;
var hasReset = false;
var lightTheme = false;

function updateRegisters() {
	if (document.getElementById("PC_Cursor")) {
		document.getElementById("PC_Cursor").id = null;
	}
	if (document.getElementById("SP_Cursor")) {
		document.getElementById("SP_Cursor").id = null;
	}
	for (var reg in registers) {
		document.getElementById(reg).innerHTML = toHex(registers[reg].toString(16));
	}
	cpu.children[registers["PC"] % 16 + 1].children[Math.floor(registers["PC"] / 16 + 1)].id = "PC_Cursor";
	cpu.children[registers["SP"] % 16 + 1].children[Math.floor(registers["SP"] / 16 + 1)].id = "SP_Cursor";
}

function clearMarkers() {
	var markers = editor.session.getMarkers();
	for (var id in markers) {
		if (markers[id].clazz === "active-line") {
			editor.session.removeMarker(id);
		}
	}
}

function step() {
	hasReset = false;
	clearMarkers();
	var inst = parseInt(cpu.children[registers["PC"] % 16 + 1].children[Math.floor(registers["PC"] / 16 + 1)].innerHTML.substring(1), 16).toString(2);
	if (isNaN(inst)) {
		if (timerID !== 0)
			run();
		return;
	}
	for (var i = inst.length; i < 8; i++)
		inst = "0" + inst;
	var next = parseInt(cpu.children[(registers["PC"] + 1) % 16 + 1].children[Math.floor((registers["PC"] + 1) / 16 + 1)].innerHTML.substring(1), 16);
	if (inst === "00000000") { // NOP

	} else if (inst.startsWith("11")) { // LD reg,reg
		registers[REG_DEC[inst.substr(2,3)]] = registers[REG_DEC[inst.substr(5,3)]];
	} else if (inst.startsWith("100000")) { // LD reg,imm
		registers[GP_REG_DEC[inst.substr(6,2)]] = next;
		registers["PC"]++;
	} else if (inst.startsWith("010")) { // LD (reg),reg
		memory.data[registers[REG_DEC[inst.substr(3,3)]]] = registers[GP_REG_DEC[inst.substr(6,2)]];
	} else if (inst.startsWith("011")) { // LD reg,(reg)
		registers[GP_REG_DEC[inst.substr(3,2)]] = memory.data[registers[REG_DEC[inst.substr(5,3)]]];
	} else if (inst.startsWith("001000")) { // LD (adr),reg
		memory.data[next] = registers[GP_REG_DEC[inst.substr(6,2)]];
		registers["PC"]++;
	} else if (inst.startsWith("001001")) { // LD reg,(adr)
		registers[GP_REG_DEC[inst.substr(6,2)]] = memory.data[next];
		registers["PC"]++;
	} else if (inst.startsWith("100010")) { // PUSH reg
		memory.data[registers["SP"]] = registers[GP_REG_DEC[inst.substr(6,2)]];
		registers["SP"]--;
	} else if (inst.startsWith("100011")) { // POP reg
		registers["SP"]++;
		registers[GP_REG_DEC[inst.substr(6,2)]] = memory.data[registers["SP"]];
	} else if (inst.startsWith("100001")) { // INC reg
		registers[GP_REG_DEC[inst.substr(6,2)]]++;
		if (registers[GP_REG_DEC[inst.substr(6,2)]] === 0x100) {
			registers[GP_REG_DEC[inst.substr(6,2)]] = 0;
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}

		if (registers[GP_REG_DEC[inst.substr(6,2)]] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
	} else if (inst.startsWith("100100")) { // DEC reg
		if (registers[GP_REG_DEC[inst.substr(6,2)]] === 0) {
			registers[GP_REG_DEC[inst.substr(6,2)]] = 0x100;
		}
		registers[GP_REG_DEC[inst.substr(6,2)]]--;
		if (registers[GP_REG_DEC[inst.substr(6,2)]] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		if (registers[GP_REG_DEC[inst.substr(6,2)]] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
	} else if (inst.startsWith("100101")) { // ADD reg
		registers["A"] += registers[GP_REG_DEC[inst.substr(6,2)]];
		if (registers["A"] >= 0x100) {
			registers["F"] |= flags.carry;
			registers["A"] %= 0x100;
		} else {
			registers["F"] &= ~flags.carry;
		}
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		if (registers["A"] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
	} else if (inst.startsWith("100110")) { // SUB reg
		registers["A"] += 0x100 - registers[GP_REG_DEC[inst.substr(6,2)]];
		if (registers["A"] >= 0x100) {
			registers["F"] |= flags.carry;
			registers["A"] %= 0x100;
		} else {
			registers["F"] &= ~flags.carry;
		}
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		if (registers["A"] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
	} else if (inst.startsWith("100111")) { // CP reg
		var oldA = registers["A"];
		registers["A"] += 0x100 - registers[GP_REG_DEC[inst.substr(6,2)]];
		if (registers["A"] >= 0x100) {
			registers["F"] |= flags.carry;
			registers["A"] %= 0x100;
		} else {
			registers["F"] &= ~flags.carry;
		}
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		if (registers["A"] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
		registers["A"] = oldA;
	} else if (inst.startsWith("101000")) { // AND reg
		registers["A"] = registers["A"] & registers[GP_REG_DEC[inst.substr(6,2)]];
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
	} else if (inst.startsWith("101001")) { // OR reg
		registers["A"] = registers["A"] | registers[GP_REG_DEC[inst.substr(6,2)]];
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
	} else if (inst.startsWith("101010")) { // XOR reg
		registers["A"] = registers["A"] ^ registers[GP_REG_DEC[inst.substr(6,2)]];
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
	} else if (inst.startsWith("10101100")) { // AND reg
		registers["A"] = registers["A"] & next;
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		registers["PC"]++;
	} else if (inst.startsWith("10101101")) { // OR reg
		registers["A"] = registers["A"] | next;
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		registers["PC"]++;
	} else if (inst.startsWith("10101110")) { // XOR reg
		registers["A"] = registers["A"] ^ next;
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		registers["PC"]++;
	} else if (inst.startsWith("10101111")) { // NEG
		registers["A"] = 0x100 - registers["A"];
	} else if (inst.startsWith("10110000")) { // SRL
		registers["A"] >>= 1;
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
	} else if (inst.startsWith("10110001")) { // SRA
		if (registers["A"] %2 == 1) {
			registers["F"] |= flags.carry;
		} else {
			registers["F"] &= ~flags.carry;
		}
		if (registers["A"] >= 0x80) {
			registers["A"] >>= 1;
			registers["A"] += 0x80;
		} else {
			registers["A"] >>= 1;
		}
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		if (registers["A"] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
	} else if (inst.startsWith("10110010")) { // SLA
		registers["A"] <<= 1;
		if (registers["A"] >= 0x100) {
			registers["A"] %= 0x100;
			registers["F"] |= flags.carry;
		} else {
			registers["F"] &= ~flags.carry;
		}
		if (registers["A"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		if (registers["A"] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
	} else if (inst.startsWith("10110100")) { // CALL adr
		memory.data[registers["SP"]] = registers["PC"] + 1;
		registers["SP"]--;
		registers["PC"] = next - 1;
	} else if (inst.startsWith("10110101")) { // RET
		registers["SP"]++;
		registers["PC"] = memory.data[registers["SP"]];
	} else if (inst.startsWith("10110111")) { // JUMP adr
		registers["PC"] = next - 1;
	} else if (inst.startsWith("10111")) { // JUMP cond,adr
		var cond = inst.substr(5,3);
		if (cond === "001" && registers["F"] & flags.carry || cond === "010" && !(registers["F"] & flags.carry) || 
				cond === "011" && registers["F"] & flags.zero || cond === "100" && !(registers["F"] & flags.zero) ||
				cond === "101" && registers["F"] & flags.sign || cond === "110" && !(registers["F"] & flags.sign)) {
			registers["PC"] = next - 1;
		} else {
         registers["PC"]++;
      }
	} else if (inst.startsWith("10110110")) { // DJNZ adr
		if (registers["B"] === 0) {
			registers["B"] = 0x100;
		}
		registers["B"]--;
		if (registers["B"] === 0) {
			registers["F"] |= flags.zero;
		} else {
			registers["F"] &= ~flags.zero;
		}
		if (registers["B"] >= 0x80) {
			registers["F"] |= flags.sign;
		} else {
			registers["F"] &= ~flags.sign;
		}
		if (registers["F"] & flags.zero) {
			registers["PC"]++;
		} else {
			registers["PC"] = next - 1;
		}
	}

	registers["PC"]++;
	editor.session.addMarker(new Range(memory.lineNum[registers["PC"]], 0, memory.lineNum[registers["PC"]], 1), "active-line", "fullLine");
	for (var i = 0; i < memory.data.length; i++) {
		if (memory.data[i] === "-") {
			cpu.children[i % 16 + 1].children[Math.floor(i / 16 + 1)].innerHTML = "-";
		} else {
			cpu.children[i % 16 + 1].children[Math.floor(i / 16 + 1)].innerHTML = toHex(memory.data[i]).toUpperCase();
		}
	}
	updateRegisters();
}

function toggleHelp() {
	showHelp = !showHelp;
	if (showHelp) {
		document.body.appendChild(help);
		cpu.remove();
	} else {
		document.body.appendChild(cpu);
		help.remove();
	}
}

function reset() {
	if (hasReset) {
		clearMemory();
      showMemory();
	}
	if (timerID !== 0) {
		run();
	}
	clearMarkers();
	registers = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0, "PC": 0, "SP": 0x7F};
	editor.session.addMarker(new Range(memory.lineNum[registers["PC"]], 0, memory.lineNum[registers["PC"]], 1), "active-line", "fullLine");
	updateRegisters();

	hasReset = true;
}

function run() {
	hasReset = false;
	if (timerID === 0) {
		timerID = window.setInterval(step, 50);
		document.getElementById("run-button").innerHTML = "Pause<br>||";
	} else {
		window.clearInterval(timerID);
		timerID = 0;
		document.getElementById("run-button").innerHTML = "Run<br>&gt;";
	}
}

function clearMemory() {
	memory.data = new Array(128);
	memory.data.fill("-");
	memory.lineNum = new Array(128);
	memory.lineNum.fill(-1);
}

function flash() {
	clearMarkers();
   clearMemory();

	if (showHelp)
		toggleHelp();

	var src = editor.getValue();
	var lines = src.split("\n");
	var lineNum = 0;
	var locCounter = 0;
	var labelVals = {};
	var labelAddr = [];
	lines.forEach(function(line) {
		lineNum++;
		if (line.includes(";")) {
			line = line.substring(0, line.indexOf(";"));
		}

		line = line.toUpperCase().trim();

		if (!line) {
			return;
		} else if (line.match(/([A-z]|[0-9])+:/) && line.match(/([A-z]|[0-9])+:/).index === 0) {
			labelVals[line.substr(0, line.length - 1)] = locCounter;
			return;
		}
		var oper;
		var args = [];
		var argVals = [];
		if (line.includes(" ")) {
			oper = line.substring(0,line.indexOf(" "));
			argVals = line.substring(line.indexOf(" ")).trim().split(",");
			for (var i = 0; i < argVals.length; i++) {
				argVals[i] = argVals[i].trim();
				if (!isNaN(parseInt(argVals[i], 10))) {
					args[i] = type.IMM;
				} else if (argVals[i] === "A" || argVals[i] === "B" || argVals[i] === "C" || argVals[i] === "D") {
					args[i] = type.GP_REG;
				} else if (argVals[i] === "F" || argVals[i] === "PC" || argVals[i] === "SP") {
					args[i] = type.REG;
				} else if (argVals[i] === "C" || argVals[i] === "NC" || argVals[i] === "Z" || argVals[i] === "NZ" || argVals[i] === "S" || argVals[i] === "NS") { 
					args[i] = type.COND;
				} else if (argVals[i].match(/([A-z]|[0-9])+/) && argVals[i].match(/([A-z]|[0-9])+/).index === 0) {
					labelAddr.push({
						id: argVals[i],
						addr: locCounter + 1
					});
					args[i] = type.IMM;
				} else if (argVals[i].startsWith("(") && argVals[i].endsWith(")")) {
					argVals[i] = argVals[i].substr(1,argVals[i].length - 2);
					if (argVals[i] === "A" || argVals[i] === "B" || argVals[i] === "C" || argVals[i] === "D" || argVals[i] === "F" || argVals[i] === "PC" || argVals[i] === "SP") {
						args[i] = type.REGI;
					} else if (!isNaN(parseInt(argVals[i], 10))) {
						args[i] = type.ADR;
					} else if (argVals[i].match(/([A-z]|[0-9])+/) && argVals[i].match(/([A-z]|[0-9])+/).index === 0) {
						labelAddr.push({
							id: argVals[i],
							addr: locCounter + 1
						});
						args[i] = type.ADR;
					}
				}
			}
		} else {
			oper = line;	
		}
		console.log('op: ' + oper + ' args: ' + args);

		// Check and execute assembler directives
		if (oper === ".ORG" && argMatch([type.IMM], args)) {
			locCounter = parseInt(argVals[0], 10);
			return;
		} else if (oper === ".BYTE" && argMatch([type.IMM], args)) {
			memory.data[locCounter++] = parseInt(argVals[0], 10);
			return;
		}
		INSTRUCTIONS.forEach(function(inst) {
			if (oper === inst.oper && argMatch(inst.args, args)) {
				memory.lineNum[locCounter] = lineNum - 1;
				var instCode = inst.prefix;
				var constant = "";
				for (var i = 0; i < args.length; i++) {
					if (inst.args[i] === type.IMM || inst.args[i] === type.ADR) {
						constant = argVals[i];
					} else if (inst.args[i] === type.REG || inst.args[i] == type.REGI) {
						instCode += REG_ENC[argVals[i]];
					} else if (inst.args[i] === type.GP_REG) {
						instCode += GP_REG_ENC[argVals[i]];
					} else if (inst.args[i] === type.COND) {
						instCode += COND_ENC[argVals[i]];
					}
				}
				memory.data[locCounter++] = parseInt(instCode, 2);
				if (constant !== "") {
					memory.data[locCounter++] = parseInt(constant, 10);
				}
				return;
			}
		});
	});
	labelAddr.forEach(function(label) {
		memory.data[label.addr] = labelVals[label.id];
	});

	editor.session.addMarker(new Range(memory.lineNum[registers["PC"]], 0, memory.lineNum[registers["PC"]], 1), "active-line", "fullLine");
   showMemory();
}

function showMemory() {
	for (var i = 0; i < memory.data.length; i++) {
		if (memory.data[i] === "-") {
			cpu.children[i % 16 + 1].children[Math.floor(i / 16 + 1)].innerHTML = "-";
		} else {
			cpu.children[i % 16 + 1].children[Math.floor(i / 16 + 1)].innerHTML = toHex(memory.data[i]).toUpperCase();
		}
	}
}

function argMatch(a, b) {
	if (a.length != b.length) return false;
	for (var i = 0; i < a.length; i++) {
		if (a[i] !== b[i] && !(a[i] === type.REG && b[i] === type.GP_REG))
			return false;
	}
	return true;
}

function toHex(a) {
	a = a.toString(16);
	if (a.length === 1)
		a = "0" + a;
	return "$" + a;
}

window.onload = function() {
	editor = ace.edit("editor");
	editor.setFontSize(30);
	editor.setTheme("ace/theme/twilight");
   editor.session.setOptions({
      tabSize: 3,
      useSoftTabs: true
   });
	//ace.require("ace/keybindings/vim");
	//editor.setKeyboardHandler("ace/keyboard/vim");    
		
	var hex = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
	cpu = document.getElementById("cpu");
	var header = document.createElement("tr");
	var helpButton = document.createElement("td");
	header.appendChild(helpButton);
	helpButton.id = "help-button";
	helpButton.onclick = toggleHelp; 
	helpButton.innerHTML = "HELP";
	helpButton.className = "cell";

	for (var i = 0; i < 8; i++) {
		var msd = document.createElement("th");
		msd.className = "cell";
		msd.innerHTML = i;
		msd.style.color = "#666";
		header.appendChild(msd);
	}
	cpu.appendChild(header);
	document.getElementById("help").children[0].insertBefore(header.cloneNode(true), document.getElementById("help").children[0].firstChild);
	document.getElementById("help").children[0].children[0].children[0].onclick = toggleHelp;
	document.getElementById("help").children[0].children[0].children[0].innerHTML = "MEMORY";
	document.getElementById("help").children[0].children[0].children[0].style.backgroundColor = "var(--wred)";

	for (var i = 0; i < 16; i++) {
	var row = document.createElement("tr");
	var lsd = document.createElement("th");
	lsd.className = "cell";
		lsd.innerHTML = hex[i];
		lsd.style.color = "#666";
		row.appendChild(lsd);	
		for (var j = 0; j < 8; j++) {
			var cell = document.createElement("td");
			cell.className = "cell";
			cell.innerHTML = " - ";
			row.appendChild(cell);	
		}
		cpu.appendChild(row);
	}
	updateRegisters();
	help = document.getElementById("help");
	help.remove();
	document.forms["formy"].elements["file-input"].onchange = function(e) {
		var reader = new FileReader();
		reader.onload = function(e) {
			editor.setValue(e.target.result);
		}
		reader.readAsText(e.target.files[0]);
	};
}

function save() {
	var src = editor.getValue();
	console.log(src);
	var a = document.createElement("a");
	a.setAttribute("href", "data:text/plain;charser=utf-8," + encodeURI(src));
	a.setAttribute("download", "wasm_code.txt");
	a.style.display = "none";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

function fileInput() {
	var filein = document.getElementById("file-input");
	filein.click();
}

function toggleLight() {
   lightTheme = !lightTheme;
   var lightButton = document.getElementById("light-button");
   var html = document.getElementsByTagName("html")[0];
   if (lightTheme) {
      editor.setTheme("ace/theme/dawn");
      html.style.setProperty("--bg", "white");
      html.style.setProperty("--fg", "black");
      lightButton.innerHTML = "Dark";
   } else {
      editor.setTheme("ace/theme/twilight");
      html.style.setProperty("--bg", "black");
      html.style.setProperty("--fg", "white");
      lightButton.innerHTML = "Light";
   }
}

SET FOREIGN_KEY_CHECKS=0;

-- ----------------------------
-- Function structure for calculate_check_digit
-- ----------------------------
DROP FUNCTION IF EXISTS `calculate_check_digit`;
DELIMITER ;;
CREATE DEFINER=`root`@`%` FUNCTION `calculate_check_digit`(`ic_number` varchar(256)) RETURNS varchar(255) CHARSET latin1
BEGIN

declare check_digit varchar(1);
declare first_letter varchar(1);
declare alpha_index int;
-- declare digit int;
-- declare digit_string varchar(10);
declare sum int;

set first_letter = upper(substr(ic_number, 1, 1));
if is_numeric(first_letter) then return null;
end if;

drop temporary table if exists _check_digit_table;
create temporary table if not exists _check_digit_table (
	_first_letter varchar(1), _remainder int, _last_letter varchar(1));
insert into _check_digit_table (_first_letter, _remainder, _last_letter) values 
  ('S', 0, 'J'), ('S', 1, 'Z'), ('S', 2, 'I'), ('S', 3, 'H'),
	('S',4,'G'), ('S', 5, 'F'), ('S', 6, 'E'),('S', 7, 'D'),('S', 8, 'C'),
	('S', 9, 'B'), ('S', 10, 'A'), ('T', 0, 'J'), ('T', 1, 'Z'), ('T', 2, 'I'), ('T', 3, 'H'),
	('T',4,'G'), ('T', 5, 'F'), ('T', 6, 'E'),('T', 7, 'D'),('T', 8, 'C'),
	('T', 9, 'B'), ('T', 10, 'A'),('F', 0, 'X'), ('F', 1, 'W'), ('F', 2, 'U'), ('F', 3, 'T'),
	('F',4,'R'), ('F', 5, 'Q'), ('F', 6, 'P'),('F', 7, 'N'),('F', 8, 'M'),
	('F', 9, 'L'), ('F', 10, 'K'), ('G', 0, 'X'), ('G', 1, 'W'), ('G', 2, 'U'), ('G', 3, 'T'),
	('G',4,'R'), ('G', 5, 'Q'), ('G', 6, 'P'),('G', 7, 'N'),('G', 8, 'M'),
	('G', 9, 'L'), ('G', 10, 'K');

set alpha_index = patindex('^[^0-9]', ic_number);
while alpha_index > 0 do 
	set ic_number = insert(ic_number, alpha_index, 1, '');
	set alpha_index = patindex('^[^0-9]', ic_number);
end while;

set ic_number = ltrim(rtrim(ic_number));
set sum = substr(ic_number, 1,1) * 2 + substr(ic_number, 2,1) * 7 + substr(ic_number, 3, 1) * 6 + 
substr(ic_number, 4, 1) * 5 + substr(ic_number, 5,1) * 4 + substr(ic_number, 6,1) * 3 + 
substr(ic_number, 7, 1) * 2;

if first_letter = 'T' or first_letter ='G' then set sum = sum + 4;
end if;

select _last_letter into check_digit from _check_digit_table 
where _first_letter = first_letter and _remainder = sum % 11;

	RETURN check_digit ;
END
;;
DELIMITER ;

-- ----------------------------
-- Function structure for clean_person_id
-- ----------------------------
DROP FUNCTION IF EXISTS `clean_person_id`;
DELIMITER ;;
CREATE DEFINER=`root`@`%` FUNCTION `clean_person_id`(`person_id` varchar(128)) RETURNS varchar(128) CHARSET latin1
BEGIN
	RETURN REPLACE(person_id, ' ', '');
END
;;
DELIMITER ;

-- ----------------------------
-- Function structure for get_money_amount
-- ----------------------------
DROP FUNCTION IF EXISTS `get_money_amount`;
DELIMITER ;;
CREATE DEFINER=`root`@`%` FUNCTION `get_money_amount`(`data_string` varchar(128), `dot_position` smallint) RETURNS decimal(38,2)
BEGIN
	-- TODO: check param
	declare working varchar(128);
	declare first_digit_position SMALLINT;
	declare premodifier varchar(1);

	set premodifier = SUBSTR(data_string, 1, 1);
	set working = INSERT(data_string, dot_position+1, 0, '.'); -- insert dot

	-- remove + or - if applicable
	IF premodifier = '+' OR premodifier = '-' THEN
		set working = SUBSTR(working, 2, LENGTH(working)-1);
		set dot_position = dot_position - 1;
	END IF;

	-- remove leading 0 and trailing digits and add the scale
	set first_digit_position = patindex('^[1-9]', working);
	
	-- if no digit 1-9
	if first_digit_position = 0 THEN set working = '0.00';
	else set working = SUBSTR(working, first_digit_position, dot_position - first_digit_position + 2 + 2);
  end if;

	
	IF premodifier = '-' THEN
		SET working = CONCAT('-', working);
	END IF;	

  RETURN working;
END
;;
DELIMITER ;

-- ----------------------------
-- Function structure for is_numeric
-- ----------------------------
DROP FUNCTION IF EXISTS `is_numeric`;
DELIMITER ;;
CREATE DEFINER=`root`@`%` FUNCTION `is_numeric`(`str` varchar(255)) RETURNS tinyint(4)
BEGIN
	return str regexp '^[0-9\.]+$';
END
;;
DELIMITER ;

-- ----------------------------
-- Function structure for non_zero_index
-- ----------------------------
DROP FUNCTION IF EXISTS `non_zero_index`;
DELIMITER ;;
CREATE DEFINER=`root`@`%` FUNCTION `non_zero_index`(`str` varchar(255)) RETURNS smallint(6)
BEGIN
	declare idx SMALLINT;
	declare len SMALLINT;
	declare is_stop tinyint;

	set idx = 1;
	set len = LENGTH(str);
	set is_stop = FALSE;

	WHILE NOT is_stop DO
		IF SUBSTR(str, idx) REGEXP '^[1-9]+' THEN
			SET is_stop = TRUE;
		ELSE
			SET idx = idx + 1;
		END IF;
	END WHILE;
	
	RETURN idx;
END
;;
DELIMITER ;

-- ----------------------------
-- Function structure for patindex
-- ----------------------------
DROP FUNCTION IF EXISTS `patindex`;
DELIMITER ;;
CREATE DEFINER=`root`@`%` FUNCTION `patindex`(`pattern` varchar(255), `str` varchar(255)) RETURNS int(11)
BEGIN
	declare idx int;
  declare len int;
  declare is_stop tinyint;
  
  set len = length(str);
	
	if len <= 0 then set is_stop = true; set idx = 0;
  else set is_stop = false; set idx = 1;
  end if;

  while not is_stop do 
		if substr(str, idx) regexp pattern then set is_stop = true;
		elseif idx = len then set is_stop = true; set idx = 0;
		else set idx = idx + 1;
		end if;
	end while;

	RETURN idx;
END
;;
DELIMITER ;
